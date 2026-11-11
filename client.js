window.__ModuleLoader__.load({
  id: '@local/tree-conversations',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useMemo, useCallback } = React;

    // ---------------------------------------------------------------- design
    const C = {
      accent: 'var(--dsw-alias-brand-primary)',
      accentSoft: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)',
      ink: 'var(--dsw-alias-label-primary)',
      ink2: 'var(--dsw-alias-label-secondary)',
      ink3: 'var(--dsw-alias-label-secondary)',
      line: 'var(--dsw-alias-border-l2)',
      card: 'var(--dsw-alias-bg-layer-1)',
      cardEdge: 'var(--dsw-alias-border-l1)',
      canvas: 'var(--dsw-alias-bg-base)',
      warn: 'var(--dsw-alias-state-error-primary)',
      ok: 'var(--dsw-alias-state-success-primary)',
    };
    const NODE_W = 320;
    const NODE_H = 212;
    const GAP_X = 44;
    const GAP_Y = 76;
    const FONT = 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

    // ------------------------------------------------------------- utilities
    function textOf(content) {
      if (typeof content === 'string') return content;
      if (!Array.isArray(content)) return '';
      let out = '';
      for (const block of content) {
        if (block && block.type === 'text' && typeof block.text === 'string') out += block.text;
      }
      return out;
    }

    function seqOf(entry) {
      const event = entry && entry.event;
      return event && typeof event.seq === 'number' ? event.seq : 0;
    }

    function maxDurableSeq(entries) {
      let max = 0;
      for (const entry of entries) {
        const event = entry && entry.event;
        if (entry.type === 'event' && event && typeof event.seq === 'number' && event.seq > max) max = event.seq;
      }
      return max;
    }

    /** Cost of one session window's newest turn: wall clock + last-step context. */
    function turnCost(entries, baselineSeq) {
      if (!Array.isArray(entries)) return { ms: 0, tokens: 0, cached: 0, running: false };
      const floor = typeof baselineSeq === 'number' && baselineSeq > 0 ? baselineSeq : 0;
      let start = 0;
      let end = 0;
      let newest = 0;
      let tokens = 0;
      let cached = 0;
      for (const entry of entries) {
        const event = entry && entry.event;
        if (!event || entry.type !== 'event') continue;
        const seq = typeof event.seq === 'number' ? event.seq : 0;
        if (seq <= floor) continue;
        const time = typeof event.time === 'number' ? event.time : 0;
        const data = event.data || {};
        if (event.type === 'turn/start') {
          // A window can hold several turns; only the newest one is measured.
          start = time; end = 0; newest = time; tokens = 0; cached = 0;
        } else if (event.type === 'assistant/message') {
          // One turn is N steps, and every step repeats the whole context in
          // `usage`: summing totalTokens over a turn bills it once per step
          // (10x-62x in a real log). The final step is the footprint a fork
          // inherits, so keep that and report cache reads beside it.
          const usage = data.usage;
          if (usage && typeof usage.totalTokens === 'number') tokens = usage.totalTokens;
          if (usage && typeof usage.cacheReadTokens === 'number') cached = usage.cacheReadTokens;
          if (time > newest) newest = time;
        } else if (event.type === 'turn/end') {
          if (time) end = time;
          if (time > newest) newest = time;
        } else if (!end && time > newest) {
          newest = time;
        }
      }
      const stop = end || newest;
      return {
        ms: start && stop > start ? stop - start : 0,
        tokens: tokens,
        cached: cached,
        running: Boolean(start) && !end,
      };
    }

    /** Short numeric label for a cost: `12s · 18.3k tok`. Latin and units only. */
    function formatCost(cost) {
      if (!cost) return '';
      const short = (value) => {
        if (value >= 1000000) return (value / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (value >= 100000) return Math.round(value / 1000) + 'k';
        if (value >= 1000) return (value / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
        return String(Math.round(value));
      };
      const parts = [];
      const ms = cost.ms > 0 ? Math.round(cost.ms) : 0;
      const tokens = cost.tokens > 0 ? Math.round(cost.tokens) : 0;
      if (ms > 0) {
        const seconds = Math.max(1, Math.round(ms / 1000));
        if (seconds < 60) parts.push(seconds + 's');
        else if (seconds < 3600) parts.push(Math.floor(seconds / 60) + 'm' + ('0' + (seconds % 60)).slice(-2) + 's');
        else parts.push(Math.floor(seconds / 3600) + 'h' + ('0' + Math.floor((seconds % 3600) / 60)).slice(-2) + 'm');
      }
      if (tokens > 0) parts.push(short(tokens) + ' tok');
      return parts.join(' · ');
    }

    const PROMPT_KINDS = ['user', 'user-rpc', 'user_command', 'command'];

    function sourceKindOf(data) {
      const source = data && data.source;
      if (!source) return undefined;
      return source.kind || source.type;
    }

    function isRealPrompt(data) {
      const kind = sourceKindOf(data);
      if (kind === undefined) return false;
      return PROMPT_KINDS.indexOf(kind) >= 0;
    }

    /** Fold a session's event window into question/answer turns. */
    function projectTurns(entries, sessionRunning) {
      const turns = [];
      let current = null;
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (!entry || !entry.event) continue;
        const event = entry.event;
        const data = event.data || {};
        if (entry.type === 'transient') {
          // Live tokens are not durable events; they only feed the turn that is
          // still being written, so a settled card keeps its final answer.
          if (event.type === 'assistant/live-chunk' && current) {
            const chunk = data.chunk;
            if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') {
              current.streamText = (current.streamText || '') + chunk.text;
              current.answer = current.streamText;
            }
          }
          continue;
        }
        if (entry.type !== 'event') continue;
        if (event.type === 'turn/start') {
          current = {
            question: '', answer: '', answerSeq: 0, qSeq: 0, status: 'running',
            real: false, kind: '', costFrom: index, streamText: '',
            step: 0, tool: '', startedAt: typeof event.time === 'number' ? event.time : 0,
          };
          turns.push(current);
        } else if (event.type === 'step/start') {
          if (current) current.step = typeof data.step === 'number' ? data.step : current.step + 1;
        } else if (event.type === 'tool/call') {
          if (current && data.name) current.tool = String(data.name);
        } else if (event.type === 'tool/result') {
          if (current) current.tool = '';
        } else if (event.type === 'user/message') {
          const target = current || turns[turns.length - 1];
          if (target) {
            const text = textOf(data.content);
            if (text.trim() && isRealPrompt(data)) {
              target.question = text;
              target.real = true;
              target.kind = sourceKindOf(data) || '';
              target.qSeq = typeof event.seq === 'number' ? event.seq : 0;
            }
          }
        } else if (event.type === 'assistant/message') {
          const target = current || turns[turns.length - 1];
          if (target && data.message) {
            const text = textOf(data.message.content);
            if (text.trim()) {
              target.answer = text;
              target.streamText = text;
            }
            target.answerSeq = typeof event.seq === 'number' ? event.seq : target.answerSeq;
          }
        } else if (event.type === 'turn/end') {
          const target = current || turns[turns.length - 1];
          if (target) {
            target.status = target.answer ? 'done' : 'stopped';
            target.tool = '';
            target.streamText = '';
          }
          if (current && typeof current.costFrom === 'number') {
            current.cost = turnCost(entries.slice(current.costFrom, index + 1), 0);
          }
          current = null;
        }
      }
      // A turn that has not ended yet still costs something: measure to the tail.
      if (current && typeof current.costFrom === 'number') {
        current.cost = turnCost(entries.slice(current.costFrom), 0);
      }
      // An open turn only means "回答中" while the session is actually running;
      // a crashed or reloaded tail must not look like it is still thinking.
      if (sessionRunning === false) {
        for (const turn of turns) if (turn.status === 'running') turn.status = turn.answer ? 'done' : 'stopped';
      }
      return turns.filter((turn) => turn.real && (turn.question.trim() || turn.answer.trim()));
    }

    /** Read one branch session's own events (everything after `baseline`). */
    function readBranch(entries, baseline) {
      let text = '';
      let answer = '';
      let answerSeq = 0;
      let ended = false;
      let step = 0;
      let tool = '';
      let startedAt = 0;
      const cost = turnCost(entries, baseline);
      for (const entry of entries) {
        const event = entry && entry.event;
        if (!event) continue;
        if (entry.type === 'transient') {
          if (event.type === 'assistant/live-chunk' && seqOf(entry) > baseline) {
            const chunk = event.data && event.data.chunk;
            if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text;
          }
          continue;
        }
        if (entry.type !== 'event') continue;
        const seq = typeof event.seq === 'number' ? event.seq : 0;
        if (seq <= baseline) continue;
        if (event.type === 'turn/start') {
          startedAt = typeof event.time === 'number' ? event.time : startedAt;
          step = 0;
          tool = '';
        } else if (event.type === 'step/start') {
          const data = event.data || {};
          step = typeof data.step === 'number' ? data.step : step + 1;
        } else if (event.type === 'tool/call') {
          const data = event.data || {};
          if (data.name) tool = String(data.name);
        } else if (event.type === 'tool/result') {
          tool = '';
        } else if (event.type === 'assistant/message') {
          const data = event.data || {};
          if (data.message) {
            const finalText = textOf(data.message.content);
            if (finalText.trim()) {
              answer = finalText;
              text = finalText;
            }
          }
          answerSeq = seq;
        } else if (event.type === 'turn/end') {
          ended = true;
          tool = '';
        }
      }
      return { text, answer, answerSeq, ended, cost, step, tool, startedAt };
    }

    // ----------------------------------------------------------------- layout
    /** Branches at this depth and deeper start folded, so a big tree opens readable. */
    const DEFAULT_COLLAPSE_DEPTH = 2;

    /** Group nodes by parent id; '@root' holds every top-level node. */
    function childrenMapOf(nodes) {
      const childrenOf = new Map();
      for (const node of nodes) {
        const key = node.parentId === null || node.parentId === undefined ? '@root' : node.parentId;
        if (!childrenOf.has(key)) childrenOf.set(key, []);
        childrenOf.get(key).push(node);
      }
      return childrenOf;
    }

    /** Depth of every node: 0 for a tree root, one more per hop down. */
    function depthMapOf(nodes) {
      const byId = new Map(nodes.map((node) => [node.id, node]));
      const depthOf = new Map();
      for (const node of nodes) {
        let depth = 0;
        let cursor = node;
        while (cursor && cursor.parentId !== null && cursor.parentId !== undefined && depth < 200) {
          cursor = byId.get(cursor.parentId);
          depth += 1;
        }
        depthOf.set(node.id, depth);
      }
      return depthOf;
    }

    /**
     * Fold the tri-state `collapsed` map into plain booleans.
     * undefined follows the depth default; true/false are the user's own choice.
     */
    function effectiveCollapsedOf(nodes, collapsed) {
      const depthOf = depthMapOf(nodes);
      const childrenOf = childrenMapOf(nodes);
      const choices = collapsed || {};
      const result = {};
      for (const node of nodes) {
        const manual = choices[node.id];
        if (manual === true || manual === false) {
          result[node.id] = manual;
        } else {
          const hasChildren = (childrenOf.get(node.id) || []).length > 0;
          result[node.id] = hasChildren && (depthOf.get(node.id) || 0) >= DEFAULT_COLLAPSE_DEPTH;
        }
      }
      return result;
    }

    /** How many descendants sit under every node, for the folded chip. */
    function descendantCountsOf(nodes, childrenOf) {
      const map = childrenOf || childrenMapOf(nodes);
      const counts = new Map();
      const visit = (node) => {
        let total = 0;
        for (const child of map.get(node.id) || []) total += visit(child) + 1;
        counts.set(node.id, total);
        return total;
      };
      for (const root of map.get('@root') || []) visit(root);
      return counts;
    }

    /** A node id plus every id below it. */
    function subtreeIdsOf(nodes, id) {
      const childrenOf = childrenMapOf(nodes);
      const result = new Set([id]);
      const stack = [id];
      while (stack.length) {
        const current = stack.pop();
        for (const child of childrenOf.get(current) || []) {
          if (result.has(child.id)) continue;
          result.add(child.id);
          stack.push(child.id);
        }
      }
      return result;
    }

    /** Ids masked by the tombstone overlay: hidden itself or under a hidden ancestor. */
    function hiddenSetOf(nodes, hidden) {
      const marks = hidden || {};
      const byId = new Map(nodes.map((node) => [node.id, node]));
      const memo = new Map();
      const resolve = (node) => {
        const chain = [];
        let cursor = node;
        let verdict = false;
        let guard = 0;
        while (cursor && guard < 500) {
          if (memo.has(cursor.id)) {
            verdict = memo.get(cursor.id);
            break;
          }
          if (marks[cursor.id] === true) {
            verdict = true;
            chain.push(cursor);
            break;
          }
          chain.push(cursor);
          cursor = cursor.parentId === null || cursor.parentId === undefined ? undefined : byId.get(cursor.parentId);
          guard += 1;
        }
        for (const item of chain) memo.set(item.id, verdict);
        return verdict;
      };
      const result = new Set();
      for (const node of nodes) if (resolve(node)) result.add(node.id);
      return result;
    }

    /** A, B, C… labels, numbered in the same walk the layout uses. */
    function labelMapOf(nodes, collapsed) {
      const childrenOf = childrenMapOf(nodes);
      const result = new Map();
      let counter = 0;
      const letter = (n) => String.fromCharCode(65 + (n % 26)) + (n >= 26 ? String(Math.floor(n / 26)) : '');
      const visit = (node) => {
        result.set(node.id, letter(counter));
        counter += 1;
        if (!collapsed[node.id]) for (const child of childrenOf.get(node.id) || []) visit(child);
      };
      for (const root of childrenOf.get('@root') || []) visit(root);
      return result;
    }

    function layoutTree(nodes, collapsed, heights) {
      const childrenOf = childrenMapOf(nodes);
      const kids = (node) => (collapsed[node.id] ? [] : childrenOf.get(node.id) || []);
      const roots = childrenOf.get('@root') || [];
      const widths = new Map();
      const depthOf = depthMapOf(nodes);

      const rowHeight = [];
      for (const node of nodes) {
        const depth = depthOf.get(node.id);
        const height = heights[node.id] || NODE_H;
        rowHeight[depth] = Math.max(rowHeight[depth] || 0, height);
      }
      const rowTop = [];
      let top = 0;
      for (let depth = 0; depth < rowHeight.length; depth += 1) {
        rowTop[depth] = top;
        top += rowHeight[depth] + GAP_Y;
      }

      function measure(node) {
        const list = kids(node);
        if (list.length === 0) {
          widths.set(node.id, NODE_W);
          return NODE_W;
        }
        let total = 0;
        list.forEach((child, index) => {
          total += measure(child) + (index > 0 ? GAP_X : 0);
        });
        const width = Math.max(NODE_W, total);
        widths.set(node.id, width);
        return width;
      }

      const positions = new Map();

      function place(node, left) {
        const list = kids(node);
        const depth = depthOf.get(node.id) || 0;
        if (list.length === 0) {
          positions.set(node.id, { x: left + (widths.get(node.id) - NODE_W) / 2, y: rowTop[depth] || 0 });
          return;
        }
        let cursor = left;
        for (const child of list) {
          place(child, cursor);
          cursor += widths.get(child.id) + GAP_X;
        }
        const first = positions.get(list[0].id).x + NODE_W / 2;
        const last = positions.get(list[list.length - 1].id).x + NODE_W / 2;
        positions.set(node.id, { x: (first + last) / 2 - NODE_W / 2, y: rowTop[depth] || 0 });
      }

      let x = 0;
      for (const root of roots) {
        measure(root);
        place(root, x);
        x += widths.get(root.id) + GAP_X * 2;
      }

      const edges = [];
      for (const node of nodes) {
        const parentPos = positions.get(node.id);
        if (!parentPos) continue;
        const parentHeight = heights[node.id] || NODE_H;
        for (const kidNode of kids(node)) {
          const kidPos = positions.get(kidNode.id);
          if (!kidPos) continue;
          edges.push({
            id: node.id + '>' + kidNode.id,
            x1: parentPos.x + NODE_W / 2,
            y1: parentPos.y + parentHeight,
            x2: kidPos.x + NODE_W / 2,
            y2: kidPos.y,
          });
        }
      }

      let maxX = 0;
      let maxY = 0;
      for (const [id, pos] of positions) {
        maxX = Math.max(maxX, pos.x + NODE_W);
        maxY = Math.max(maxY, pos.y + (heights[id] || NODE_H));
      }
      for (const node of nodes) {
        const pos = positions.get(node.id);
        if (pos) maxY = Math.max(maxY, pos.y + (heights[node.id] || NODE_H));
      }

      return { positions, edges, width: maxX, height: maxY, roots };
    }

    function pathOf(nodes, id) {
      const byId = new Map(nodes.map((node) => [node.id, node]));
      const path = new Set();
      let cursor = byId.get(id);
      let guard = 0;
      while (cursor && guard < 500) {
        path.add(cursor.id);
        cursor = cursor.parentId === null || cursor.parentId === undefined ? undefined : byId.get(cursor.parentId);
        guard += 1;
      }
      return path;
    }

    // Prefer creation time, never completion time (parallel branches may finish out of order).
    function latestNodeOf(nodes) {
      let latest = null;
      let latestTime = -1;
      for (const node of nodes) {
        const legacy = /^b-([0-9a-z]+)-/.exec(node.id || '');
        const time = Number(node.createdAt || node.startedAt) || (legacy ? parseInt(legacy[1], 36) : 0);
        if (time >= latestTime) { latest = node; latestTime = time; }
      }
      return latest;
    }

    // ------------------------------------------------------------------ store
    const STORE_PREFIX = 'dsh.treeConversations.v2:';
    const INDEX_KEY = 'dsh.treeConversations.v2:index';

    function readIndex() {
      try {
        return JSON.parse(window.localStorage.getItem(INDEX_KEY) || '{}') || {};
      } catch (error) {
        return {};
      }
    }

    function writeIndex(index) {
      try {
        window.localStorage.setItem(INDEX_KEY, JSON.stringify(index));
      } catch (error) {
        /* ignore quota failures */
      }
    }

    function createStore(rootId) {
      const listeners = new Set();
      const state = {
        nodes: [],
        collapsed: {},
        // Tombstone overlay: the session log is append-only, so deleting a node
        // only masks it and its subtree here.
        hidden: {},
        archived: [],
        selectedId: null,
        composingId: null,
        readingId: null,
        draft: '',
        loaded: false,
        error: null,
        meta: { events: 0, binding: false, hasMore: false },
        heights: {},
      };
      const stops = new Map();
      let revision = 0;

      try {
        const raw = window.localStorage.getItem(STORE_PREFIX + rootId);
        if (raw) {
          const saved = JSON.parse(raw) || {};
          if (Array.isArray(saved.nodes)) state.nodes = saved.nodes;
          if (saved.collapsed && typeof saved.collapsed === 'object') state.collapsed = saved.collapsed;
          if (saved.hidden && typeof saved.hidden === 'object') state.hidden = saved.hidden;
          if (Array.isArray(saved.archived)) state.archived = saved.archived;
        }
      } catch (error) {
        /* ignore corrupt state */
      }

      function writeNow() {
        try {
          const payload = {
            nodes: state.nodes.map((node) => ({
              id: node.id,
              parentId: node.parentId,
              sessionId: node.sessionId,
              question: node.question,
              answer: node.answer,
              status: node.status,
              answerSeq: node.answerSeq,
              kind: node.kind,
              sourceKind: node.sourceKind,
              baseSeq: node.baseSeq,
              createdAt: node.createdAt,
              startedAt: node.startedAt,
              cost: node.cost,
            })),
            collapsed: state.collapsed,
            hidden: state.hidden,
            archived: state.archived,
          };
          window.localStorage.setItem(STORE_PREFIX + rootId, JSON.stringify(payload));
        } catch (error) {
          /* ignore quota failures */
        }
      }

      let persistTimer = null;
      function persist() {
        if (persistTimer !== null) return;
        persistTimer = window.setTimeout(() => {
          persistTimer = null;
          writeNow();
        }, 400);
      }

      function emit() {
        revision += 1;
        for (const listener of listeners) listener();
      }

      const api = {
        rootId,
        getSnapshot() {
          return { ...state, revision };
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        getNode(id) {
          return state.nodes.find((node) => node.id === id);
        },
        children(id) {
          return state.nodes.filter((node) => node.parentId === id);
        },
        upsert(node) {
          const index = state.nodes.findIndex((existing) => existing.id === node.id);
          if (index >= 0) {
            state.nodes[index] = { ...state.nodes[index], ...node };
          } else {
            state.nodes.push({ ...node });
          }
          state.nodes = state.nodes.slice();
          persist();
          emit();
        },
        patch(id, changes) {
          const target = state.nodes.find((node) => node.id === id);
          if (!target) return;
          Object.assign(target, changes);
          state.nodes = state.nodes.slice();
          persist();
          emit();
        },
        ensureChain(turns) {
          let changed = false;
          const ids = turns.map((turn, index) => 'root-' + (turn.qSeq || turn.answerSeq || index));
          turns.forEach((turn, index) => {
            const id = ids[index];
            const existing = state.nodes.find((node) => node.id === id);
            // With a partial window the first visible turn is not the real root,
            // so keep the parent it already had instead of re-rooting the chain.
            const parentId = index === 0
              ? (existing ? existing.parentId : null)
              : ids[index - 1];
            const next = {
              id,
              parentId,
              sessionId: rootId,
              question: turn.question,
              answer: turn.answer,
              status: turn.status,
              answerSeq: turn.answerSeq,
              kind: 'root',
              sourceKind: turn.kind || '',
              step: turn.step || 0,
              tool: turn.tool || '',
              startedAt: turn.startedAt || 0,
              cost: turn.cost || { ms: 0, tokens: 0, cached: 0, running: false },
            };
            if (!existing) {
              state.nodes.push(next);
              changed = true;
            } else if (
              existing.parentId !== next.parentId ||
              existing.question !== next.question ||
              existing.answer !== next.answer ||
              existing.answerSeq !== next.answerSeq ||
              existing.status !== next.status ||
              existing.step !== next.step ||
              existing.tool !== next.tool ||
              existing.startedAt !== next.startedAt ||
              !existing.cost ||
              existing.cost.ms !== next.cost.ms ||
              existing.cost.tokens !== next.cost.tokens ||
              existing.cost.cached !== next.cost.cached ||
              existing.cost.running !== next.cost.running
            ) {
              Object.assign(existing, next);
              changed = true;
            }
          });
          // Only prune when the whole history is in hand. A partial window would
          // otherwise delete older root turns and orphan the branches hanging off
          // them, which then vanish from the canvas without a trace.
          const wanted = new Set(ids);
          const before = state.nodes.length;
          if (!state.meta.hasMore) {
            state.nodes = state.nodes.filter((node) => node.sessionId !== rootId || wanted.has(node.id));
            // A branch whose parent turn is gone would be unreachable; hoist it
            // to a root instead of silently dropping it from the canvas.
            const alive = new Set(state.nodes.map((node) => node.id));
            for (const node of state.nodes) {
              if (node.parentId && !alive.has(node.parentId)) {
                node.parentId = null;
                changed = true;
              }
            }
          }
          if (state.nodes.length !== before) changed = true;
          if (changed) {
            state.nodes = state.nodes.slice();
            persist();
            emit();
          }
        },
        reveal(id) {
          const collapsed = { ...state.collapsed };
          for (const ancestor of pathOf(state.nodes, id)) {
            if (ancestor !== id) collapsed[ancestor] = false;
          }
          state.collapsed = collapsed;
          state.selectedId = id;
          persist();
          emit();
        },
        select(id) {
          state.selectedId = id;
          emit();
        },
        openReader(id) {
          state.readingId = id;
          emit();
        },
        closeReader() {
          state.readingId = null;
          emit();
        },
        toggleCollapse(id) {
          // Flip what the user sees, not the raw slot: a default-folded branch
          // must open on the first click and stay open afterwards.
          const effective = effectiveCollapsedOf(state.nodes, state.collapsed);
          state.collapsed = { ...state.collapsed, [id]: effective[id] === true ? false : true };
          persist();
          emit();
        },
        /** Hide a node and its whole subtree; the log itself is never touched. */
        hide(id) {
          const subtree = subtreeIdsOf(state.nodes, id);
          state.hidden = { ...state.hidden, [id]: true };
          if (state.selectedId && subtree.has(state.selectedId)) state.selectedId = null;
          if (state.composingId && subtree.has(state.composingId)) {
            state.composingId = null;
            state.draft = '';
          }
          persist();
          emit();
        },
        restoreHidden() {
          state.hidden = {};
          state.archived = [];
          persist();
          emit();
        },
        setArchived(ids) {
          state.archived = Array.isArray(ids) ? ids.slice() : [];
          persist();
          emit();
        },
        compose(id) {
          state.composingId = id;
          state.selectedId = id;
          state.draft = '';
          emit();
        },
        setDraft(value) {
          state.draft = value;
          emit();
        },
        cancelCompose() {
          state.composingId = null;
          state.draft = '';
          emit();
        },
        registerStop(id, stop) {
          stops.set(id, stop);
        },
        stop(id) {
          const stop = stops.get(id);
          if (stop) stop();
        },
        stopAll() {
          for (const stop of stops.values()) stop();
        },
        setError(message) {
          state.error = message;
          emit();
        },
        setMeta(meta) {
          state.meta = { ...state.meta, ...meta };
          emit();
        },
        setHeight(id, value) {
          if (!Number.isFinite(value) || value <= 0) return;
          const previous = state.heights[id];
          if (previous !== undefined && Math.abs(previous - value) < 2) return;
          state.heights = { ...state.heights, [id]: value };
          emit();
        },
      };

      return api;
    }

    // ------------------------------------------------------------------- api
    function createRuntime(ctx) {
      const stores = new Map();
      const rootSubscriptions = new Map();
      const branchSubscriptions = new Map();

      function index() {
        return readIndex();
      }

      function rootOf(sessionId) {
        const entry = index()[sessionId];
        return entry && entry.rootId ? entry.rootId : sessionId;
      }

      function storeFor(rootId) {
        if (!stores.has(rootId)) stores.set(rootId, createStore(rootId));
        return stores.get(rootId);
      }

      /** The workspaces client is optional: never let its absence break the tree. */
      function workspacesOf() {
        try {
          return ctx && ctx.workspaces ? ctx.workspaces : null;
        } catch (error) {
          return null;
        }
      }

      /**
       * Tombstone a node and its subtree. Archived sessions are remembered so
       * "恢复" can put them back into the session list.
       */
      function deleteSubtree(rootId, nodeId) {
        const store = storeFor(rootId);
        const before = store.getSnapshot();
        if (!before.nodes.some((node) => node.id === nodeId)) return;
        const subtree = subtreeIdsOf(before.nodes, nodeId);
        store.hide(nodeId);

        const after = store.getSnapshot();
        const hiddenIds = hiddenSetOf(after.nodes, after.hidden);
        const visibleSessions = new Set();
        for (const node of after.nodes) {
          if (hiddenIds.has(node.id) || !node.sessionId) continue;
          visibleSessions.add(node.sessionId);
        }
        const archived = Array.isArray(after.archived) ? after.archived.slice() : [];
        const workspaces = workspacesOf();
        let changed = false;
        for (const node of after.nodes) {
          if (!subtree.has(node.id)) continue;
          const sessionId = node.sessionId;
          // Never archive the root session, nor a session a visible node still points at.
          if (!sessionId || sessionId === rootId) continue;
          if (visibleSessions.has(sessionId) || archived.indexOf(sessionId) >= 0) continue;
          if (!workspaces || typeof workspaces.archiveSession !== 'function') continue;
          try {
            const result = workspaces.archiveSession(sessionId, { stopActivity: true });
            if (result && typeof result.catch === 'function') result.catch(() => undefined);
            archived.push(sessionId);
            changed = true;
          } catch (error) {
            /* archiving only quiets the session list; the tombstone already did the work */
          }
        }
        if (changed) store.setArchived(archived);
      }

      /** Drop every tombstone and unarchive the sessions deletion had put away. */
      function restoreHidden(rootId) {
        const store = storeFor(rootId);
        const snapshot = store.getSnapshot();
        const archived = Array.isArray(snapshot.archived) ? snapshot.archived.slice() : [];
        const workspaces = workspacesOf();
        for (const sessionId of archived) {
          if (!workspaces || typeof workspaces.unarchiveSession !== 'function') continue;
          try {
            const result = workspaces.unarchiveSession(sessionId);
            if (result && typeof result.catch === 'function') result.catch(() => undefined);
          } catch (error) {
            /* ignore */
          }
        }
        store.restoreHidden();
      }

      function remember(sessionId, rootId, nodeId) {
        const next = { ...index(), [sessionId]: { rootId, nodeId } };
        writeIndex(next);
      }

      /** Mirror the root session's own turns into nodes, then keep them in sync. */
      function ensureProjection(rootId, store) {
        const binding = ctx.sessions.binding(rootId);
        if (!binding) {
          store.setError('会话还没打开，无法投影。');
          store.setMeta({ binding: false, events: 0 });
          return;
        }
        const read = () => {
          const window = binding.eventSource.getSnapshot();
          let running;
          try {
            const session = binding.session && typeof binding.session.getSnapshot === 'function'
              ? binding.session.getSnapshot()
              : null;
            running = session ? session.running : undefined;
          } catch (error) {
            running = undefined;
          }
          store.setMeta({ binding: true, events: window.entries.length, hasMore: Boolean(window.hasMore) });
          store.ensureChain(projectTurns(window.entries, running));
        };
        read();
        if (!rootSubscriptions.has(rootId)) {
          const unsubscribe = binding.eventSource.subscribe(read);
          rootSubscriptions.set(rootId, unsubscribe);
        }
        autoLoadEarlier(rootId, binding, 8);
      }

      /** Retain a session so its event window is open, then project it. */
      async function ensureOpen(rootId, store) {
        if (ctx.sessions.binding(rootId)) {
          ensureProjection(rootId, store);
          projectBranches(rootId, store);
          return true;
        }
        try {
          const reference = ctx.sessions.retain(rootId, { source: 'gateway' });
          const binding = await reference.ready;
          if (!binding) throw new Error('会话没有返回绑定');
          ensureProjection(rootId, store);
          projectBranches(rootId, store);
          return true;
        } catch (error) {
          store.setError('打不开会话：' + String((error && error.message) || error));
          return false;
        }
      }

      /** Each branch node lives in its own session; keep its card in sync too. */
      function projectBranches(rootId, store) {
        for (const node of store.getSnapshot().nodes) {
          if (node.kind !== 'branch' || !node.sessionId) continue;
          if (branchSubscriptions.has(node.id)) continue;
          let binding = ctx.sessions.binding(node.sessionId);
          if (!binding) {
            try {
              const reference = ctx.sessions.retain(node.sessionId, { source: 'gateway' });
              reference.ready.then((ready) => {
                if (!ready) return;
                watchBranch(node.id, ready, store);
              }).catch(() => undefined);
              branchSubscriptions.set(node.id, true);
              continue;
            } catch (error) {
              continue;
            }
          }
          watchBranch(node.id, binding, store);
        }
      }

      function watchBranch(nodeId, binding, store) {
        if (branchSubscriptions.get(nodeId) === 'watching') return;
        branchSubscriptions.set(nodeId, 'watching');
        const node = store.getNode(nodeId);
        // A fork's own events start after its seed marker. Without a recorded
        // baseline, reading from 0 would show the parent's answer as this
        // branch's answer, so fall back to the seed seq instead.
        let baseline = node && typeof node.baseSeq === 'number' && node.baseSeq > 0 ? node.baseSeq : 0;
        if (!baseline) {
          const entries = binding.eventSource.getSnapshot().entries;
          for (const entry of entries) {
            const event = entry && entry.event;
            if (entry.type === 'event' && event && event.type === 'session/end-seed'
              && event.data && event.data.inherited === true && typeof event.seq === 'number') {
              baseline = event.seq;
            }
          }
        }
        const read = () => {
          const window = binding.eventSource.getSnapshot();
          const read2 = readBranch(window.entries, baseline);
          let running;
          try {
            const session = binding.session && typeof binding.session.getSnapshot === 'function'
              ? binding.session.getSnapshot()
              : null;
            running = session ? session.running : undefined;
          } catch (error) {
            running = undefined;
          }
          const changes = {};
          const current = store.getNode(nodeId);
          if (!current) return;
          if (read2.answer && read2.answer !== current.answer) changes.answer = read2.answer;
          else if (read2.text && read2.text !== current.answer) changes.answer = read2.text;
          if (read2.answerSeq) changes.answerSeq = read2.answerSeq;
          if (read2.step !== (current.step || 0)) changes.step = read2.step;
          if (read2.tool !== (current.tool || '')) changes.tool = read2.tool;
          if (read2.startedAt && read2.startedAt !== current.startedAt) changes.startedAt = read2.startedAt;
          // turnCost allocates a fresh object per event; compare before patching
          // so a streaming branch does not mark the store dirty on every chunk.
          const known = current.cost;
          if (!known
            || known.ms !== read2.cost.ms
            || known.tokens !== read2.cost.tokens
            || known.cached !== read2.cost.cached
            || known.running !== read2.cost.running) changes.cost = read2.cost;
          if (read2.ended || running === false) {
            changes.status = (read2.answer || read2.text || current.answer) ? 'done' : 'stopped';
            changes.tool = '';
          } else if (read2.text || read2.answer || read2.tool) {
            changes.status = 'streaming';
          }
          if (Object.keys(changes).length) store.patch(nodeId, changes);
        };
        read();
        binding.eventSource.subscribe(read);
      }

      function autoLoadEarlier(rootId, binding, remaining) {
        if (remaining <= 0) return;
        const window = binding.eventSource.getSnapshot();
        if (!window.hasMore) return;
        Promise.resolve(binding.session.loadOlder())
          .then(() => autoLoadEarlier(rootId, binding, remaining - 1))
          .catch(() => undefined);
      }

      async function branch(rootId, parentNode, question) {
        const store = storeFor(rootId);
        if (!parentNode) return;
        const snapshot = store.getSnapshot();
        // A tombstoned node cannot be forked from even if a stale card asks.
        if (hiddenSetOf(snapshot.nodes, snapshot.hidden).has(parentNode.id)) return;
        const nodeId = 'b-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
        let childId;
        try {
          childId = await ctx.sessions.fork({
            sessionId: parentNode.sessionId,
            atSeq: parentNode.answerSeq || undefined,
          });
        } catch (error) {
          store.setError('分叉失败：' + String((error && error.message) || error));
          return;
        }
        remember(childId, rootId, nodeId);
        store.upsert({
          id: nodeId,
          parentId: parentNode.id,
          sessionId: childId,
          question,
          answer: '',
          status: 'thinking',
          answerSeq: 0,
          kind: 'branch',
          createdAt: parseInt(nodeId.split('-')[1], 36),
        });
        store.compose(null);
        store.select(nodeId);

        let reference;
        try {
          reference = ctx.sessions.retain(childId, { source: 'gateway' });
        } catch (error) {
          store.patch(nodeId, { status: 'error', answer: '无法打开分支会话：' + String((error && error.message) || error) });
          return;
        }

        let binding;
        try {
          binding = await reference.ready;
        } catch (error) {
          store.patch(nodeId, {
            status: 'error',
            answer: '打不开分支会话：' + String((error && error.message) || error),
          });
          return;
        }
        if (!binding) {
          store.patch(nodeId, { status: 'error', answer: '分支会话没有返回可用的绑定。' });
          return;
        }
        const baseline = maxDurableSeq(binding.eventSource.getSnapshot().entries);
        let busy = false;

        // Name the fork after its branch so the session list stays readable.
        const branchTitle = '⟂ ' + (parentNode.question || '分支').replace(/\s+/g, ' ').slice(0, 26)
          + ' · ' + question.replace(/\s+/g, ' ').slice(0, 22);
        try {
          await binding.session.rename(branchTitle);
        } catch (error) {
          /* a fork title is cosmetic; keep going */
        }

        store.patch(nodeId, { baseSeq: baseline });

        const stop = () => {
          try {
            binding.session.cancel();
          } catch (error) {
            /* ignore */
          }
        };
        store.registerStop(nodeId, stop);

        const unsubscribe = binding.eventSource.subscribe(() => {
          if (busy) return;
          busy = true;
          try {
            const window = binding.eventSource.getSnapshot();
            const read = readBranch(window.entries, baseline);
            if (read.answer || read.text) {
              store.patch(nodeId, {
                answer: read.answer || read.text,
                status: read.ended ? 'done' : 'streaming',
                answerSeq: read.answerSeq || 0,
              });
            } else if (read.ended) {
              store.patch(nodeId, { status: 'done' });
            }
            if (read.ended) {
              unsubscribe();
              try {
                reference.release();
              } catch (error) {
                /* ignore */
              }
            }
          } finally {
            busy = false;
          }
        });

        store.patch(nodeId, { status: 'streaming' });
        try {
          const result = await binding.session.prompt([{ type: 'text', text: question }], 'queue');
          if (result && result.ok === false) {
            store.patch(nodeId, { status: 'error', answer: '提交失败：' + JSON.stringify(result.error) });
          }
        } catch (error) {
          store.patch(nodeId, { status: 'error', answer: '提交失败：' + String((error && error.message) || error) });
        }
      }
        async function loadOlder(rootId) {
        const binding = ctx.sessions.binding(rootId);
        if (!binding) return;
        try {
          await binding.session.loadOlder();
        } catch (error) {
          storeFor(rootId).setError('加载更早历史失败：' + String((error && error.message) || error));
        }
      }

      return { rootOf, storeFor, ensureProjection, ensureOpen, branch, loadOlder, deleteSubtree, restoreHidden };
    }

    // -------------------------------------------------------------- markdown
    const MD = {
      body: { fontSize: 12, lineHeight: 1.72, color: C.ink2, wordBreak: 'break-word' },
      h1: { fontSize: '1.14em', fontWeight: 700, color: C.ink, margin: '0.62em 0 0.28em', lineHeight: 1.4 },
      h2: { fontSize: '1.08em', fontWeight: 700, color: C.ink, margin: '0.58em 0 0.24em', lineHeight: 1.4 },
      h3: { fontSize: '1.02em', fontWeight: 600, color: C.ink, margin: '0.52em 0 0.22em', lineHeight: 1.4 },
      p: { margin: '0 0 0.5em' },
      ul: { margin: '0 0 0.5em', paddingLeft: '1.5em' },
      ol: { margin: '0 0 0.5em', paddingLeft: '1.5em' },
      li: { margin: '0 0 0.16em' },
      quote: {
        margin: '0 0 0.5em', paddingLeft: '0.75em', borderLeft: '2px solid ' + C.line,
        color: C.ink3,
      },
      hr: { border: 'none', borderTop: '1px solid #ececec', margin: '0.75em 0' },
      codeBlock: {
        margin: '0 0 0.6em', padding: '0.55em 0.75em', borderRadius: 6, background: '#f6f6f7',
        border: '1px solid #ececec', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '0.9em', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowX: 'auto', color: '#333',
      },
      inlineCode: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.92em',
        background: '#f2f2f4', borderRadius: 3, padding: '0 0.28em', color: '#333',
      },
      link: { color: C.accent, textDecoration: 'none' },
      strong: { fontWeight: 700, color: C.ink },
    };

    function inlineNodes(text, keyBase) {
      const out = [];
      const pattern = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|\*[^*\n]+\*)/g;
      let last = 0;
      let match;
      let index = 0;
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) out.push(text.slice(last, match.index));
        const token = match[0];
        const key = keyBase + '-' + index;
        index += 1;
        if (token.startsWith('**') || token.startsWith('__')) {
          out.push(h('strong', { key, style: MD.strong }, token.slice(2, -2)));
        } else if (token.startsWith('`')) {
          out.push(h('code', { key, style: MD.inlineCode }, token.slice(1, -1)));
        } else if (token.startsWith('[')) {
          const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
          out.push(h('a', {
            key,
            href: link ? link[2] : '#',
            target: '_blank',
            rel: 'noreferrer noopener',
            style: MD.link,
          }, link ? link[1] : token));
        } else {
          out.push(h('em', { key }, token.slice(1, -1)));
        }
        last = match.index + token.length;
      }
      if (last < text.length) out.push(text.slice(last));
      return out;
    }

    /** Small block-level Markdown renderer: headings, lists, quotes, fences, rules, paragraphs. */
    function renderMarkdown(text) {
      const source = String(text || '').replace(/\r\n/g, '\n');
      if (!source.trim()) return null;
      const lines = source.split('\n');
      const blocks = [];
      let i = 0;
      let blockKey = 0;

      while (i < lines.length) {
        const line = lines[i];
        const fence = /^\s*```(.*)$/.exec(line);
        if (fence) {
          const body = [];
          i += 1;
          while (i < lines.length && !/^\s*```/.test(lines[i])) {
            body.push(lines[i]);
            i += 1;
          }
          i += 1;
          blocks.push(h('pre', { key: 'b' + blockKey, style: MD.codeBlock }, body.join('\n')));
          blockKey += 1;
          continue;
        }
        if (/^\s*$/.test(line)) { i += 1; continue; }
        if (/^#{1,6}\s+/.test(line)) {
          const level = line.match(/^#+/)[0].length;
          const content = line.replace(/^#+\s+/, '');
          const style = level === 1 ? MD.h1 : level === 2 ? MD.h2 : MD.h3;
          blocks.push(h('div', { key: 'b' + blockKey, style }, inlineNodes(content, 'h' + blockKey)));
          blockKey += 1;
          i += 1;
          continue;
        }
        if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line) || /^\s*---+\s*$/.test(line)) {
          blocks.push(h('hr', { key: 'b' + blockKey, style: MD.hr }));
          blockKey += 1;
          i += 1;
          continue;
        }
        if (/^\s*[-*+]\s+/.test(line)) {
          const items = [];
          while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
            items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
            i += 1;
          }
          blocks.push(h('ul', { key: 'b' + blockKey, style: MD.ul },
            items.map((item, n) => h('li', { key: 'l' + n, style: MD.li }, inlineNodes(item, 'b' + blockKey + '-' + n)))));
          blockKey += 1;
          continue;
        }
        if (/^\s*\d+[.)]\s+/.test(line)) {
          const items = [];
          while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
            items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
            i += 1;
          }
          blocks.push(h('ol', { key: 'b' + blockKey, style: MD.ol },
            items.map((item, n) => h('li', { key: 'l' + n, style: MD.li }, inlineNodes(item, 'b' + blockKey + '-' + n)))));
          blockKey += 1;
          continue;
        }
        if (/^\s*>\s?/.test(line)) {
          const quoted = [];
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
            quoted.push(lines[i].replace(/^\s*>\s?/, ''));
            i += 1;
          }
          blocks.push(h('div', { key: 'b' + blockKey, style: MD.quote },
            inlineNodes(quoted.join(' '), 'q' + blockKey)));
          blockKey += 1;
          continue;
        }
        const paragraph = [];
        while (i < lines.length && !/^\s*$/.test(lines[i])
          && !/^\s*```/.test(lines[i]) && !/^#{1,6}\s+/.test(lines[i])
          && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) && !/^\s*>\s?/.test(lines[i])) {
          paragraph.push(lines[i]);
          i += 1;
        }
        blocks.push(h('div', { key: 'b' + blockKey, style: MD.p },
          inlineNodes(paragraph.join('\n'), 'p' + blockKey)));
        blockKey += 1;
      }
      return blocks;
    }

    function Chevron({ dir, size, color }) {
      const box = size || 10;
      const rotate = dir === 'down' ? 0 : dir === 'up' ? 180 : dir === 'right' ? -90 : 90;
      return h('svg', {
        width: box, height: box, viewBox: '0 0 16 16', 'aria-hidden': true,
        style: {
          display: 'block', flex: '0 0 auto', color: color || 'currentColor',
          transform: 'rotate(' + rotate + 'deg)', transition: 'transform 120ms ease',
        },
      }, h('path', {
        d: 'M3.5 6 L8 10.5 L12.5 6',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }));
    }

    // ------------------------------------------------------------- components
    function Badge({ label, tone }) {
      return h('span', {
        style: {
          fontSize: 10, letterSpacing: '0.06em', color: tone || C.ink3,
          textTransform: 'uppercase', fontVariantNumeric: 'tabular-nums',
        },
      }, label);
    }

    function StatusDot({ status }) {
      const color = status === 'done' ? C.ok : status === 'error' ? C.warn : C.accent;
      const pulse = status === 'thinking' || status === 'streaming' || status === 'running';
      return h('span', {
        style: {
          width: 6, height: 6, borderRadius: 3, background: color,
          boxShadow: pulse ? '0 0 0 3px ' + C.accentSoft : 'none',
          display: 'inline-block',
          animation: pulse ? 'dshTreePulse 1.4s ease-in-out infinite' : 'none',
        },
      });
    }

    /** What the model is doing right now: thinking, calling a tool, or writing. */
    function LiveProgress({ node }) {
      const running = node.status === 'thinking' || node.status === 'streaming' || node.status === 'running';
      const [, tick] = useState(0);
      useEffect(() => {
        if (!running) return undefined;
        const timer = setInterval(() => tick((n) => n + 1), 1000);
        return () => clearInterval(timer);
      }, [running]);
      if (!running) return null;
      const tool = node.tool || '';
      const step = node.step || 0;
      const elapsed = node.startedAt ? Math.max(0, Math.round((Date.now() - node.startedAt) / 1000)) : 0;
      const label = tool
        ? '正在调用 ' + tool
        : node.answer
          ? '正在输出…'
          : step > 0 ? '正在思考…' : '正在开始…';
      return h('div', {
        style: {
          marginTop: 7, padding: '6px 8px', borderRadius: 7,
          background: C.accentSoft, border: '1px solid rgba(59,111,212,0.18)',
          display: 'flex', alignItems: 'center', gap: 7,
          fontSize: 10.5, color: C.accent, lineHeight: 1.4,
        },
      },
        h('svg', {
          width: 12, height: 12, viewBox: '0 0 16 16', 'aria-hidden': true,
          style: {
            display: 'block', flex: '0 0 auto',
            animation: 'dshTreeSpin 0.75s linear infinite',
          },
        },
          h('circle', {
            cx: 8, cy: 8, r: 6, fill: 'none',
            stroke: 'currentColor', strokeWidth: 2, opacity: 0.22,
          }),
          h('path', {
            d: 'M8 2 A6 6 0 0 1 14 8',
            fill: 'none', stroke: 'currentColor', strokeWidth: 2,
            strokeLinecap: 'round',
          })),
        h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, label),
        step > 0 ? h('span', { style: { fontVariantNumeric: 'tabular-nums', opacity: 0.75 } }, '第 ' + step + ' 步') : null,
        elapsed > 0 ? h('span', { style: { fontVariantNumeric: 'tabular-nums', opacity: 0.6 } }, elapsed + 's') : null);
    }

    function NodeCard({ node, selected, dimmed, index, store, api, rootId, match, collapsed, childCount, descendants, isLatest }) {
      const snapshot = store.getSnapshot();
      const composing = snapshot.composingId === node.id;
      const [expanded, setExpanded] = useState(false);
      const [menuOpen, setMenuOpen] = useState(false);
      const cardRef = useRef(null);
      const isRunning = node.status === 'thinking' || node.status === 'streaming' || node.status === 'running';
      const answer = node.answer || '';
      const answerText = answer.length > 1400 ? answer.slice(0, 1400) + '\n\n…（点开全屏看完整回答）' : answer;

      useEffect(() => {
        const element = cardRef.current;
        if (!element || typeof ResizeObserver === 'undefined') return undefined;
        const report = () => store.setHeight(node.id, element.offsetHeight);
        report();
        const observer = new ResizeObserver(report);
        observer.observe(element);
        return () => observer.disconnect();
      }, [store, node.id]);

      useEffect(() => {
        if (!selected) setMenuOpen(false);
      }, [selected]);

      const requestDelete = () => {
        let ok = true;
        try {
          ok = window.confirm('删除这个节点和它下面的所有分支？（随时可恢复）');
        } catch (error) {
          ok = true;
        }
        if (ok) api.deleteSubtree(rootId, node.id);
      };

      const statusLabel = node.status === 'thinking' ? '思考中'
        : node.status === 'streaming' || node.status === 'running' ? '回答中'
          : node.status === 'error' ? '出错'
            : node.status === 'stopped' ? '已中止'
              : '已完成';

      return h('div', {
        ref: cardRef,
        onMouseDown: (event) => event.stopPropagation(),
        onClick: () => store.select(node.id),
        style: {
          position: 'absolute',
          left: 0,
          top: 0,
          width: NODE_W,
          minHeight: 132,
          background: C.card,
          border: '1px solid ' + (match || selected ? C.accent : C.cardEdge),
          borderLeft: '3px solid ' + (selected || isRunning ? C.accent : dimmed ? C.cardEdge : C.line),
          borderRadius: 10,
          boxShadow: selected
            ? '0 0 0 4px ' + C.accentSoft + ', 0 6px 18px rgba(0,0,0,0.08)'
            : match
              ? '0 0 0 3px ' + C.accentSoft + ', 0 2px 8px rgba(0,0,0,0.05)'
              : '0 2px 8px rgba(0,0,0,0.05)',
          padding: '10px 12px 9px',
          opacity: dimmed ? 0.72 : 1,
          boxSizing: 'border-box',
          transition: 'opacity 120ms ease, box-shadow 120ms ease',
          cursor: 'pointer',
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, minHeight: 20 } },
          h(StatusDot, { status: node.status }),
          h(Badge, { label: index, tone: C.accent }),
          isLatest
            ? h('span', {
              title: '这是最新创建的节点',
              style: {
                fontSize: 9.5, letterSpacing: '0.04em', color: C.accent, background: C.accentSoft,
                borderRadius: 999, padding: '0 6px', lineHeight: '15px', whiteSpace: 'nowrap',
              },
            }, '最新')
            : null,
          h(Badge, { label: statusLabel }),
          node.cost && (node.cost.ms || node.cost.tokens)
            ? h('span', {
              title: [
                node.cost.ms ? '耗时 ' + formatCost({ ms: node.cost.ms, tokens: 0 }) : '',
                node.cost.tokens ? '上下文 ' + formatCost({ ms: 0, tokens: node.cost.tokens }) : '',
                node.cost.cached ? '缓存 ' + formatCost({ ms: 0, tokens: node.cost.cached }) : '',
              ].filter(Boolean).join(' · '),
              style: {
                fontSize: 10.5, color: C.ink3, fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap', letterSpacing: '0.02em',
              },
            }, formatCost(node.cost))
            : null,
          h('span', { style: { flex: 1 } }),
          isRunning
            ? h('button', {
              onClick: (event) => {
                event.stopPropagation();
                store.stop(node.id);
              },
              title: '停止这条分支',
              className: BTN + ' dsh-tree-btn--sm dsh-tree-btn--danger',
            }, '停止')
            : null,
          node.status === 'done' && node.answerSeq
            ? h('button', {
              onClick: (event) => {
                event.stopPropagation();
                store.compose(node.id);
              },
              title: '在这条分支上继续追问',
              'aria-label': '在这条分支上继续追问',
              className: 'dsh-tree-btn dsh-tree-btn--icon dsh-tree-btn--sm',
              style: { color: C.accent },
            }, h(Icon, { name: 'plus' }))
            : null,
          selected
            ? h('span', { style: { position: 'relative', display: 'inline-flex' } },
              h('button', {
                onClick: (event) => {
                  event.stopPropagation();
                  setMenuOpen((value) => !value);
                },
                title: '更多操作',
                'aria-label': '更多操作',
                'aria-expanded': menuOpen,
                className: 'dsh-tree-btn dsh-tree-btn--icon dsh-tree-btn--sm',
              }, h(Icon, { name: 'more' })),
              menuOpen
                ? h('div', {
                  onMouseDown: (event) => event.stopPropagation(),
                  onClick: (event) => event.stopPropagation(),
                  style: {
                    position: 'absolute', top: 28, right: 0, zIndex: 5, background: C.card,
                    border: '1px solid ' + C.cardEdge, borderRadius: 9, padding: 4,
                    boxShadow: '0 8px 22px rgba(0,0,0,0.12)', minWidth: 132,
                  },
                }, h('button', {
                  onClick: () => {
                    setMenuOpen(false);
                    requestDelete();
                  },
                  title: '隐藏这个节点和它下面的所有分支',
                  className: 'dsh-tree-btn dsh-tree-btn--sm dsh-tree-btn--danger',
                  style: { border: 'none', background: 'transparent', width: '100%', justifyContent: 'flex-start' },
                }, '删除这个节点'))
                : null)
            : null),
        h('div', {
          style: {
            fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, color: C.ink,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          },
        }, node.question || '（无问题）'),
        h('div', {
          onClick: (event) => {
            if (!answer) return;
            event.stopPropagation();
            store.openReader(node.id);
          },
          title: answer ? '点击全屏阅读' : undefined,
          style: {
            ...MD.body,
            marginTop: 6,
            maxHeight: expanded ? 3000 : 146,
            overflow: 'hidden',
            cursor: answer ? 'zoom-in' : 'default',
            maskImage: (!expanded && answer.length > 320) ? 'linear-gradient(#000 82%, transparent 100%)' : 'none',
            WebkitMaskImage: (!expanded && answer.length > 320) ? 'linear-gradient(#000 82%, transparent 100%)' : 'none',
          },
        }, answer ? renderMarkdown(answerText) : null),
        h(LiveProgress, { node }),
        composing
          ? h(Composer, { store, api, rootId, node })
          : null,
        answer.length > 260 || childCount > 0
          ? h('div', {
            style: {
              marginTop: 9, paddingTop: 7, borderTop: '1px solid ' + C.cardEdge,
              display: 'flex', alignItems: 'center', gap: 10, minHeight: 22,
            },
          },
            answer.length > 260
              ? h('button', {
                onClick: (event) => {
                  event.stopPropagation();
                  setExpanded((value) => !value);
                },
                title: expanded ? '收起这段回答' : '展开整段回答',
                className: LINK,
                style: { color: C.accent },
              },
                expanded ? '收起回答' : '展开回答',
                h(Chevron, { dir: expanded ? 'up' : 'down', size: 9 }))
              : null,
            answer
              ? h('button', {
                onClick: (event) => {
                  event.stopPropagation();
                  store.openReader(node.id);
                },
                title: '全屏阅读完整回答',
                className: LINK,
                style: { cursor: 'zoom-in' },
              }, '全屏阅读',
                h('svg', {
                  width: 9, height: 9, viewBox: '0 0 16 16', 'aria-hidden': true,
                  style: { display: 'block', flex: '0 0 auto' },
                }, h('path', {
                  d: 'M6 2.5H2.5V6 M10 2.5h3.5V6 M6 13.5H2.5V10 M10 13.5h3.5V10',
                  fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round',
                })))
              : null,
            h('span', { style: { flex: 1 } }),
            childCount > 0
              ? h('button', {
                onClick: (event) => {
                  event.stopPropagation();
                  store.toggleCollapse(node.id);
                },
                title: collapsed ? '展开这一枝' : '收起这一枝',
                className: collapsed ? CHIP : LINK,
              },
                h(Chevron, { dir: collapsed ? 'right' : 'down', size: 9 }),
                (collapsed ? '展开 ' : '收起 ') + (descendants || childCount) + ' 个后代')
              : null)
          : null);
    }

    function Composer({ store, api, rootId, node }) {
      const snapshot = store.getSnapshot();
      const [value, setValue] = useState('');
      const ref = useRef(null);
      useEffect(() => {
        if (ref.current) ref.current.focus();
      }, []);

      const send = () => {
        const question = value.trim();
        if (!question) return;
        store.cancelCompose();
        api.branch(rootId, node, question);
      };

      return h('div', { style: { marginTop: 8, paddingTop: 8, borderTop: '1px dashed ' + C.line } },
        h('textarea', {
          ref,
          value,
          onChange: (event) => setValue(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              store.cancelCompose();
            }
          },
          placeholder: '在这条分支上继续问…（Enter 发送，Shift+Enter 换行）',
          'aria-label': '追问内容',
          rows: 2,
          className: 'dsh-tree-textarea',
          style: {
            width: '100%', boxSizing: 'border-box', resize: 'none', fontFamily: FONT,
            fontSize: 12.5, lineHeight: 1.6, padding: '8px 10px', borderRadius: 8,
            border: '1px solid ' + C.cardEdge, outline: 'none', color: C.ink, background: C.card,
          },
        }),
        h('div', { style: { display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' } },
          h('span', { style: { fontSize: 10.5, color: C.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            '从「' + (node.question || '').slice(0, 12) + '…」出发'),
          h('span', { style: { flex: 1 } }),
          h('button', {
            onClick: () => store.cancelCompose(),
            className: BTN + ' dsh-tree-btn--sm',
          }, '取消'),
          h('button', {
            onClick: send,
            className: BTN + ' dsh-tree-btn--sm dsh-tree-btn--primary',
          }, '发送')));
    }

    function Canvas({ store, api, rootId, size }) {
      const snapshot = store.getSnapshot();
      const nodes = snapshot.nodes;
      const [view, setView] = useState({ x: 40, y: 40, z: 1 });
      const [query, setQuery] = useState('');
      const drag = useRef(null);
      const wrapRef = useRef(null);
      const searchRef = useRef(null);
      const toolbarRef = useRef(null);
      const [pendingFocus, setPendingFocus] = useState(null);

      /** Deleted nodes stay in the log but leave the canvas entirely. */
      const hiddenIds = useMemo(() => hiddenSetOf(nodes, snapshot.hidden), [nodes, snapshot.hidden]);
      const liveNodes = useMemo(
        () => (hiddenIds.size ? nodes.filter((node) => !hiddenIds.has(node.id)) : nodes),
        [nodes, hiddenIds]);
      const collapsedMap = useMemo(
        () => effectiveCollapsedOf(liveNodes, snapshot.collapsed),
        [liveNodes, snapshot.collapsed]);
      const counts = useMemo(() => {
        const childrenOf = childrenMapOf(liveNodes);
        const direct = new Map();
        for (const [key, list] of childrenOf) direct.set(key, list.length);
        return { direct, descendants: descendantCountsOf(liveNodes, childrenOf) };
      }, [liveNodes]);
      const layout = useMemo(
        () => layoutTree(liveNodes, collapsedMap, snapshot.heights),
        [liveNodes, collapsedMap, snapshot.heights]);
      const path = useMemo(
        () => (snapshot.selectedId ? pathOf(liveNodes, snapshot.selectedId) : new Set()),
        [liveNodes, snapshot.selectedId]);
      const matches = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return null;
        const hit = new Set();
        for (const node of liveNodes) {
          const haystack = ((node.question || '') + '\n' + (node.answer || '')).toLowerCase();
          if (haystack.indexOf(needle) >= 0) hit.add(node.id);
        }
        return hit;
      }, [liveNodes, query]);
      const labels = useMemo(() => labelMapOf(liveNodes, collapsedMap), [liveNodes, collapsedMap]);
      const running = liveNodes.filter((node) => node.status === 'thinking' || node.status === 'streaming' || node.status === 'running').length;
      const hiddenCount = hiddenIds.size;
      const tombstoned = Object.keys(snapshot.hidden || {}).length;

      /** Only render cards near the viewport; the canvas itself is one transform. */
      const visibleNodes = useMemo(() => {
        if (liveNodes.length <= 40) return liveNodes;
        const margin = 400;
        const left = -view.x / view.z - margin;
        const top = -view.y / view.z - margin;
        const right = left + size.w / view.z + margin * 2;
        const bottom = top + size.h / view.z + margin * 2;
        const shown = [];
        for (const node of liveNodes) {
          const pos = layout.positions.get(node.id);
          if (!pos) continue;
          const height = snapshot.heights[node.id] || NODE_H;
          if (pos.x + NODE_W >= left && pos.x <= right && pos.y + height >= top && pos.y <= bottom) {
            shown.push(node);
          }
        }
        return shown.length ? shown : liveNodes;
      }, [liveNodes, layout, view, size, snapshot.heights]);

      /** Reveal first; position only after the expanded layout has committed. */
      const focusNode = useCallback((id) => {
        store.reveal(id);
        setPendingFocus(id);
      }, [store]);
      useEffect(() => {
        if (!pendingFocus) return;
        const pos = layout.positions.get(pendingFocus);
        if (!pos) { setPendingFocus(null); return; }
        const rect = wrapRef.current ? wrapRef.current.getBoundingClientRect() : { width: 900, height: 600 };
        const top = (toolbarRef.current ? toolbarRef.current.offsetHeight : 44) + 28;
        const height = snapshot.heights[pendingFocus] || NODE_H;
        const z = Math.max(0.2, Math.min(1, (rect.width - 48) / NODE_W, (rect.height - top - 32) / height));
        setView({ z, x: rect.width / 2 - (pos.x + NODE_W / 2) * z,
          y: top + (rect.height - top) / 2 - (pos.y + height / 2) * z });
        setPendingFocus(null);
      }, [pendingFocus, layout, snapshot.heights]);
      const latest = latestNodeOf(liveNodes);

      /** Minimap projection: fit the whole tree, centred, with a viewport frame. */
      const minimapRef = useRef({ scale: 1, ox: 0, oy: 0 });
      const minimap = useMemo(() => {
        const w = 168;
        const h = 112;
        const scale = Math.min((w - 12) / Math.max(1, layout.width), (h - 12) / Math.max(1, layout.height));
        return {
          scale,
          ox: (w - layout.width * scale) / 2,
          oy: (h - layout.height * scale) / 2,
        };
      }, [layout.width, layout.height]);
      minimapRef.current = minimap;

      /** Step to the next hit without leaving the current position. */
      const jumpToNextMatch = useCallback((direction) => {
        if (!matches || matches.size === 0) return;
        const hitIds = liveNodes.filter((node) => matches.has(node.id)).map((node) => node.id);
        if (hitIds.length === 0) return;
        const currentIndex = hitIds.indexOf(snapshot.selectedId);
        const nextIndex = currentIndex < 0
          ? 0
          : (currentIndex + direction + hitIds.length) % hitIds.length;
        focusNode(hitIds[nextIndex]);
      }, [matches, liveNodes, snapshot.selectedId, focusNode]);

      const onWheel = (event) => {
        event.preventDefault();
        const rect = wrapRef.current ? wrapRef.current.getBoundingClientRect() : { left: 0, top: 0 };
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        setView((current) => {
          const next = Math.min(2, Math.max(0.2, current.z * (event.deltaY < 0 ? 1.08 : 0.92)));
          const scale = next / current.z;
          return { z: next, x: px - (px - current.x) * scale, y: py - (py - current.y) * scale };
        });
      };

      const onMouseDown = (event) => {
        if (event.button !== 0) return;
        drag.current = { x: event.clientX, y: event.clientY, ox: view.x, oy: view.y };
        store.select(null);
      };
      const onMouseMove = (event) => {
        // Snapshot the drag start before scheduling state: React may run the
        // updater after mouseup has already cleared the ref, and reading
        // `drag.current.ox` at that point throws. Capturing here keeps the
        // handler independent of the ref's later lifetime.
        const start = drag.current;
        if (!start) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        setView((current) => ({ z: current.z, x: start.ox + dx, y: start.oy + dy }));
      };
      const endDrag = () => {
        drag.current = null;
      };

      /** Height the floating toolbar occupies, so the tree starts below it. */
      const chromeHeight = () => (toolbarRef.current ? toolbarRef.current.offsetHeight : 48) + 22;

      const fit = () => {
        const rect = wrapRef.current ? wrapRef.current.getBoundingClientRect() : { width: 900, height: 600 };
        if (!layout.width || !layout.height) return;
        const chrome = chromeHeight();
        const availableW = Math.max(200, rect.width - 80);
        const availableH = Math.max(200, rect.height - chrome - 48);
        const z = Math.min(1, Math.min(availableW / layout.width, availableH / layout.height));
        const scale = Math.max(0.2, z);
        setView({
          z: scale,
          x: (rect.width - layout.width * scale) / 2,
          y: chrome,
        });
      };

      /** Zoom around the viewport centre so the middle of the picture stays put. */
      const zoomBy = (factor) => {
        const rect = wrapRef.current ? wrapRef.current.getBoundingClientRect() : { width: 900, height: 600 };
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        setView((current) => {
          const next = Math.min(2, Math.max(0.2, current.z * factor));
          const scale = next / current.z;
          return { z: next, x: cx - (cx - current.x) * scale, y: cy - (cy - current.y) * scale };
        });
      };

      const fittedRef = useRef(false);
      useEffect(() => {
        if (fittedRef.current || !liveNodes.length || !size.w) return;
        fittedRef.current = true;
        const rect = wrapRef.current ? wrapRef.current.getBoundingClientRect() : { width: 900, height: 600 };
        const chrome = chromeHeight();
        const availableW = Math.max(200, rect.width - 96);
        const availableH = Math.max(200, rect.height - chrome - 56);
        const raw = Math.min(1, availableW / Math.max(1, layout.width), availableH / Math.max(1, layout.height));
        const scale = Math.max(0.62, raw);
        setView({
          z: scale,
          x: Math.max(28, (rect.width - layout.width * scale) / 2),
          y: chrome,
        });
      }, [liveNodes.length, size.w]);

      // Ctrl/Cmd+F is the tree's own search while this view is mounted.
      useEffect(() => {
        const onKey = (event) => {
          if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
          if (event.key !== 'f' && event.key !== 'F') return;
          event.preventDefault();
          if (searchRef.current) {
            searchRef.current.focus();
            if (typeof searchRef.current.select === 'function') searchRef.current.select();
          }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, []);

      return h('div', {
        ref: wrapRef,
        onWheel,
        onMouseDown,
        onMouseMove,
        onMouseUp: endDrag,
        onMouseLeave: endDrag,
        style: {
          position: 'absolute', inset: 0, overflow: 'hidden', background: C.canvas,
          backgroundImage: 'radial-gradient(color-mix(in srgb, ' + C.line + ' 55%, transparent) 1px, transparent 1px)',
          backgroundSize: (15 * view.z) + 'px ' + (15 * view.z) + 'px',
          backgroundPosition: view.x + 'px ' + view.y + 'px',
          cursor: drag.current ? 'grabbing' : 'grab',
          userSelect: 'none',
        },
      },
        h('div', {
          style: {
            position: 'absolute', left: 0, top: 0,
            transform: 'translate(' + view.x + 'px, ' + view.y + 'px) scale(' + view.z + ')',
            transformOrigin: '0 0',
            width: Math.max(layout.width + 200, 600),
            height: Math.max(layout.height + 200, 400),
          },
        },
          h('svg', {
            width: Math.max(layout.width + 200, 600),
            height: Math.max(layout.height + 200, 400),
            style: { position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' },
          },
            layout.edges.map((edge) => {
              const active = path.has(edge.id.split('>')[0]) && path.has(edge.id.split('>')[1]);
              return h('path', {
                key: edge.id,
                d: 'M' + edge.x1 + ' ' + edge.y1 + ' C' + edge.x1 + ' ' + (edge.y1 + 40) + ', ' + edge.x2 + ' ' + (edge.y2 - 40) + ', ' + edge.x2 + ' ' + edge.y2,
                fill: 'none',
                stroke: active ? C.accent : C.line,
                strokeWidth: active ? 2 : 1.4,
                opacity: active ? 1 : 0.85,
              });
            })),
          visibleNodes.map((node) => {
            const pos = layout.positions.get(node.id);
            if (!pos) return null;
            return h('div', {
              key: node.id,
              style: { position: 'absolute', left: pos.x, top: pos.y },
            }, h(NodeCard, {
              node, store, api, rootId,
              selected: snapshot.selectedId === node.id,
              dimmed: snapshot.selectedId !== null && !path.has(node.id),
              index: labels.get(node.id),
              match: matches ? matches.has(node.id) : false,
              collapsed: collapsedMap[node.id] === true,
              childCount: counts.direct.get(node.id) || 0,
              descendants: counts.descendants.get(node.id) || 0,
              isLatest: latest ? latest.id === node.id : false,
            }));
          })),

        // toolbar
        h('div', {
          ref: toolbarRef,
          onMouseDown: (event) => event.stopPropagation(),
          onWheel: (event) => event.stopPropagation(),
          style: {
            position: 'absolute', top: 10, left: 12, right: 12, display: 'flex', gap: 8,
            flexWrap: 'wrap', padding: 8, borderRadius: 12, background: C.card,
            border: '1px solid ' + C.cardEdge, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            alignItems: 'center', fontSize: 12, color: C.ink3,
          },
        },
          h('span', { style: { fontWeight: 600, color: C.ink, fontSize: 12 } }, '无限探索'),
          h('span', null, '· ' + liveNodes.length + ' 个节点'),
          running > 0 ? h('span', { style: { color: C.accent } }, '· ' + running + ' 条分支在跑') : null,
          snapshot.error ? h('span', { style: { color: C.warn } }, '· ' + snapshot.error) : null,
          snapshot.meta.hasMore
            ? h('button', { onClick: () => api.loadOlder(rootId), ...btnProps() }, '加载更早')
            : null,
          tombstoned > 0
            ? h('button', {
              onClick: () => api.restoreHidden(rootId),
              title: '恢复被删除的节点和分支',
              ...pillProps(),
            }, '已隐藏 ' + Math.max(hiddenCount, tombstoned) + ' 个 · 恢复')
            : null,
          h('span', { style: { flex: 1 } }),
          h('div', {
            style: {
              display: 'flex', alignItems: 'center', gap: 6, border: '1px solid ' + C.cardEdge,
              background: C.canvas, borderRadius: 8, padding: '0 8px', minHeight: 32,
              boxSizing: 'border-box', color: C.ink3,
            },
          },
            h(Icon, { name: 'search' }),
            h('input', {
              ref: searchRef,
              value: query,
              onChange: (event) => setQuery(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  jumpToNextMatch(event.shiftKey ? -1 : 1);
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setQuery('');
                }
              },
              placeholder: '搜索节点',
              'aria-label': '搜索节点',
              style: {
                border: 'none', outline: 'none', fontSize: 12, width: 92, padding: '5px 0',
                fontFamily: FONT, color: C.ink, background: 'transparent',
              },
            }),
            matches && matches.size > 0
              ? h('span', { style: { fontSize: 11, color: C.accent, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } }, String(matches.size))
              : null),
          h('div', { role: 'group', 'aria-label': '画布缩放', style: { display: 'flex', alignItems: 'center', gap: 4 } },
            h('button', {
              title: '缩小画布', 'aria-label': '缩小画布', disabled: view.z <= 0.21,
              onClick: () => zoomBy(1 / 1.15),
              className: BTN_ICON,
            }, h(Icon, { name: 'minus' })),
            h('span', {
              title: '当前缩放比例',
              style: { minWidth: 44, textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: C.ink2, fontSize: 11.5 },
            }, Math.round(view.z * 100) + '%'),
            h('button', {
              title: '放大画布', 'aria-label': '放大画布', disabled: view.z >= 1.99,
              onClick: () => zoomBy(1.15),
              className: BTN_ICON,
            }, h(Icon, { name: 'plus' }))),
          h('button', { onClick: fit, className: BTN, title: '缩放到能看见整棵树' }, h(Icon, { name: 'fit' }), '适应画布'),
          h('button', {
            disabled: !latest,
            onClick: () => { if (!latest) return; setQuery(''); focusNode(latest.id); },
            title: latest ? '展开路径并定位到最新创建的节点' : '还没有节点',
            className: BTN_PRIMARY,
          }, h(Icon, { name: 'latest' }), '定位最新')),

        // minimap
        layout.width > 0
          ? h('div', {
            onMouseDown: (event) => event.stopPropagation(),
            style: {
              position: 'absolute', right: 12, bottom: 12, width: 168, height: 112,
              border: '1px solid ' + C.cardEdge, borderRadius: 8, background: C.card,
              boxShadow: '0 2px 10px rgba(0,0,0,0.06)', overflow: 'hidden', cursor: 'pointer',
            },
            onClick: (event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const map = minimapRef.current;
              if (!map) return;
              // Invert the same scale+centering the preview uses, so a click
              // lands on the node under the cursor instead of near it.
              const localX = (event.clientX - rect.left - map.ox) / map.scale;
              const localY = (event.clientY - rect.top - map.oy) / map.scale;
              const wrapper = wrapRef.current ? wrapRef.current.getBoundingClientRect() : { width: 900, height: 600 };
              setView((current) => ({
                z: current.z,
                x: wrapper.width / 2 - localX * current.z,
                y: wrapper.height / 2 - localY * current.z,
              }));
            },
          },
            h('div', {
              style: {
                position: 'absolute', left: 0, top: 0, width: '100%', height: '100%',
                transform: 'translate(' + minimap.ox + 'px, ' + minimap.oy + 'px) scale(' + minimap.scale + ')',
                transformOrigin: '0 0',
              },
            },
              h('svg', {
                width: layout.width,
                height: layout.height,
                style: { position: 'absolute', left: 0, top: 0, overflow: 'visible' },
              },
                layout.edges.map((edge) => h('path', {
                  key: edge.id,
                  d: 'M' + edge.x1 + ' ' + edge.y1 + ' L' + edge.x2 + ' ' + edge.y2,
                  fill: 'none', stroke: C.line, strokeWidth: 3,
                })),
                liveNodes.map((node) => {
                  const pos = layout.positions.get(node.id);
                  if (!pos) return null;
                  const active = path.has(node.id);
                  return h('rect', {
                    key: node.id,
                    x: pos.x, y: pos.y, width: NODE_W,
                    height: snapshot.heights[node.id] || NODE_H,
                    rx: 10,
                    fill: matches && matches.has(node.id) ? C.accent : active ? C.accentSoft : C.line,
                    stroke: active ? C.accent : 'transparent',
                    strokeWidth: 1 / minimap.scale,
                  });
                })),
              // What the canvas is looking at right now.
              h('rect', {
                x: -view.x / view.z, y: -view.y / view.z,
                width: size.w / view.z, height: size.h / view.z,
                fill: C.accentSoft, fillOpacity: 0.45,
                stroke: C.accent, strokeWidth: 1.5 / minimap.scale,
                rx: 6,
              })))
          : null,

        nodes.length === 0
          ? h('div', {
            style: {
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', pointerEvents: 'none',
            },
          }, h('div', { style: { textAlign: 'center', color: C.ink3 } },
            h('div', { style: { fontSize: 13, color: C.ink2, marginBottom: 6 } }, '这棵树还是空的'),
            h('div', { style: { fontSize: 11.5, lineHeight: 1.7 } },
              '回到 Chat 问一句，这里就会长出第一个节点。'),
            h('div', { style: { fontSize: 11, marginTop: 4 } },
              '若已经问过却有这句提示，把上面的「事件」数告我。')))
          : null);
    }

    function Icon({ name }) {
      const paths = {
        plus: 'M8 3v10M3 8h10', minus: 'M3 8h10',
        search: 'M11 11l3 3M12 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
        fit: 'M6 2H2v4M10 2h4v4M2 10v4h4M14 10v4h-4',
        latest: 'M8 1v3M8 12v3M1 8h3M12 8h3M12 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
        more: 'M3 8h.01M8 8h.01M13 8h.01',
        close: 'M4 4l8 8M12 4l-8 8',
      };
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true,
        style: { display: 'block', flexShrink: 0 } }, h('path', {
        d: paths[name], fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }));
    }

    // Buttons: all paint lives in CSS so :hover/:active/:focus-visible can exist.
    // Inline styles only carry layout that varies per call site.
    const BTN = 'dsh-tree-btn';
    const BTN_ICON = 'dsh-tree-btn dsh-tree-btn--icon';
    const BTN_PRIMARY = 'dsh-tree-btn dsh-tree-btn--primary';
    const CHIP = 'dsh-tree-chip';
    const LINK = 'dsh-tree-link';

    function btnProps(extraStyle) {
      return { className: BTN, style: extraStyle };
    }

    function pillProps(extraStyle) {
      return { className: CHIP, style: extraStyle };
    }

    class Boundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null, stack: '' };
      }
      static getDerivedStateFromError(error) {
        return { error: String((error && error.message) || error) };
      }
      componentDidCatch(error) {
        if (window.console && window.console.error) window.console.error('[tree]', error);
        this.setState({ stack: String((error && error.stack) || '').split('\n').slice(0, 4).join('\n') });
      }
      render() {
        if (this.state.error) {
          return h('div', {
            style: {
              position: 'absolute', inset: 0, padding: '24px 28px', fontFamily: FONT,
              fontSize: 12.5, lineHeight: 1.8, color: C.warn, background: C.canvas, overflow: 'auto',
            },
          },
            h('div', { style: { fontWeight: 600, marginBottom: 6 } }, '树视图出错了'),
            h('div', { style: { color: C.ink2, fontFamily: 'ui-monospace, monospace' } }, this.state.error),
            h('div', {
              style: {
                color: C.ink3, fontFamily: 'ui-monospace, monospace', fontSize: 10.5,
                whiteSpace: 'pre-wrap', marginTop: 8,
              },
            }, this.state.stack),
            h('button', {
              onClick: () => this.setState({ error: null, stack: '' }),
              style: {
                marginTop: 14, border: '1px solid ' + C.accent, background: C.accent, color: '#fff',
                borderRadius: 8, fontSize: 12, padding: '4px 12px', cursor: 'pointer', fontFamily: FONT,
              },
            }, '重新载入视图'),
            h('span', { style: { color: C.ink3, fontSize: 11, marginLeft: 10 } },
              '画布数据没有丢，只是这一次渲染炸了。'));
        }
        return this.props.children;
      }
    }

    function Reader({ node, onClose }) {
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
      }, [onClose]);

      return h('div', {
        onClick: onClose,
        style: {
          position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(24,24,26,0.34)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 34px',
        },
      },
        h('div', {
          onClick: (event) => event.stopPropagation(),
          style: {
            width: '100%', maxWidth: 820, maxHeight: '100%', background: C.card,
            borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          },
        },
          h('div', {
            style: {
              padding: '14px 20px 11px', borderBottom: '1px solid #efefef',
              display: 'flex', alignItems: 'flex-start', gap: 12,
            },
          },
            h('div', { style: { flex: 1, minWidth: 0 } },
              h('div', {
                style: { fontSize: 10.5, color: C.ink3, letterSpacing: '0.05em', marginBottom: 4 },
              }, (node.kind === 'branch' ? '分支' : '主线') + ' · ' + (node.id || '')),
              h('div', {
                style: { fontSize: 15, fontWeight: 600, lineHeight: 1.5, color: C.ink },
              }, node.question || '（无问题）')),
            h('button', {
              onClick: onClose,
              title: '关闭（Esc）',
              'aria-label': '关闭阅读视图',
              className: 'dsh-tree-btn dsh-tree-btn--icon',
              style: { width: 30, height: 30, minWidth: 30, minHeight: 30 },
            }, h(Icon, { name: 'close' }))),
          h('div', {
            style: {
              padding: '18px 22px 22px', overflow: 'auto', flex: 1,
              ...MD.body, fontSize: 13.4, lineHeight: 1.85,
            },
          }, node.answer ? renderMarkdown(node.answer) : '（还没有回答）'),
          h('div', {
            style: {
              padding: '8px 20px', borderTop: '1px solid ' + C.cardEdge, fontSize: 10.5,
              color: C.ink3, display: 'flex', gap: 10, alignItems: 'center',
            },
          },
            h('span', null, 'Esc 关闭 · 点背景关闭'),
            h('span', { style: { flex: 1 } }),
            node.cost && (node.cost.ms || node.cost.tokens)
              ? h('span', null, formatCost(node.cost))
              : null)));
    }

    function TreeView(props) {
      const { sessionId, api } = props;
      const rootId = useMemo(() => api.rootOf(sessionId), [sessionId, api]);
      const store = useMemo(() => api.storeFor(rootId), [rootId, api]);
      const [, force] = useState(0);
      const hostRef = useRef(null);
      const [size, setSize] = useState({ w: 0, h: 0 });

      useEffect(() => store.subscribe(() => force((n) => n + 1)), [store]);
      useEffect(() => {
        api.ensureOpen(rootId, store);
      }, [rootId, store, api]);
      useEffect(() => {
        const element = hostRef.current;
        if (!element) return undefined;
        const measure = () => setSize({ w: element.clientWidth, h: element.clientHeight });
        measure();
        if (typeof ResizeObserver === 'undefined') {
          window.addEventListener('resize', measure);
          return () => window.removeEventListener('resize', measure);
        }
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
      }, []);

      const snapshot = store.getSnapshot();
      const reading = snapshot.readingId ? store.getNode(snapshot.readingId) : undefined;

      return h('div', {
        ref: hostRef,
        style: {
          position: 'relative', width: '100%', height: '100%', minHeight: 420,
          overflow: 'hidden', fontFamily: FONT, color: C.ink, background: C.canvas,
        },
      },
        h(Boundary, null, h(Canvas, { store, api, rootId, size })),
        reading ? h(Reader, { node: reading, onClose: () => store.closeReader() }) : null);
    }

    // ------------------------------------------------------------------ mount
    function ensureStyles() {
      if (typeof document === 'undefined' || !document.head) return;
      // Always rewrite the sheet. A hot-reloaded module re-runs apply() while the
      // previous <style> node is still in the document; skipping on "already
      // present" would freeze the first version's rules forever.
      let style = document.getElementById('dsh-tree-styles');
      if (!style) {
        style = document.createElement('style');
        style.id = 'dsh-tree-styles';
        document.head.appendChild(style);
      }
      style.textContent = [
        '@keyframes dshTreeSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }',
        '@keyframes dshTreePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }',
        // Every control shares one geometry so the toolbar reads as one row.
        '.dsh-tree-btn {',
        '  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);',
        '  color: var(--dsw-alias-label-secondary); border-radius: 8px;',
        '  font-family: inherit; font-size: 12px; line-height: 20px;',
        '  min-height: 32px; min-width: 32px; padding: 5px 10px;',
        '  display: inline-flex; align-items: center; justify-content: center; gap: 6px;',
        '  white-space: nowrap; flex-shrink: 0; box-sizing: border-box; cursor: pointer;',
        '  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;',
        '}',
        '.dsh-tree-btn:hover:not([disabled]) {',
        '  background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);',
        '  border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary);',
        '}',
        '.dsh-tree-btn:active:not([disabled]) {',
        '  background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);',
        '}',
        '.dsh-tree-btn:focus-visible {',
        '  outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px;',
        '}',
        '.dsh-tree-btn[disabled] { opacity: 0.45; cursor: default; }',
        '.dsh-tree-btn--icon { padding: 0; min-width: 30px; min-height: 30px; }',
        '.dsh-tree-btn--primary {',
        '  background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff;',
        '}',
        '.dsh-tree-btn--primary:hover:not([disabled]) {',
        '  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 86%, #000);',
        '  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 86%, #000);',
        '  color: #fff;',
        '}',
        '.dsh-tree-btn--sm { min-height: 24px; min-width: 24px; padding: 2px 8px; border-radius: 7px; font-size: 11.5px; }',
        '.dsh-tree-btn--danger { color: var(--dsw-alias-state-error-primary); }',
        '.dsh-tree-btn--danger:hover:not([disabled]) {',
        '  color: var(--dsw-alias-state-error-primary);',
        '  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);',
        '  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);',
        '}',
        '.dsh-tree-chip {',
        '  border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 32%, transparent);',
        '  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent);',
        '  color: var(--dsw-alias-brand-primary); border-radius: 999px; font-family: inherit;',
        '  font-size: 11px; line-height: 18px; padding: 2px 10px; cursor: pointer; white-space: nowrap;',
        '}',
        '.dsh-tree-chip:hover {',
        '  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent);',
        '}',
        '.dsh-tree-link {',
        '  border: none; background: transparent; font-family: inherit; font-size: 11px;',
        '  line-height: 16px; padding: 2px 0; cursor: pointer; white-space: nowrap;',
        '  display: inline-flex; align-items: center; gap: 4px; color: var(--dsw-alias-label-secondary);',
        '  border-radius: 4px;',
        '}',
        '.dsh-tree-link:hover { color: var(--dsw-alias-brand-primary); }',
        '.dsh-tree-link:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }',
        '.dsh-tree-textarea:focus { border-color: var(--dsw-alias-brand-primary) !important; }',
      ].join('\n');
      document.head.appendChild(style);
    }

    return {
      inject: ['slots', 'sessions'],
      apply(ctx) {
        ensureStyles();
        const runtime = createRuntime(ctx);
        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: 'tree',
          order: 5,
          label: () => '无限探索',
          inject: () => ({ api: {
            rootOf: runtime.rootOf,
            storeFor: runtime.storeFor,
            ensureProjection: runtime.ensureProjection,
            ensureOpen: runtime.ensureOpen,
            branch: runtime.branch,
            loadOlder: runtime.loadOlder,
            deleteSubtree: runtime.deleteSubtree,
            restoreHidden: runtime.restoreHidden,
          } }),
        }, TreeView));
      },
    };
  },
});
