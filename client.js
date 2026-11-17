window.__ModuleLoader__.load({
  id: '@tanzz/dsh-explore',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useMemo, useCallback } = React;

    // ---------------------------------------------------------------- design
    // Every colour is a DSH alias token, so the view follows the live theme:
    // the shell flips `body[data-ds-dark-theme]` and the tokens move with it.
    const C = {
      accent: 'var(--dsw-alias-brand-primary)',
      accentSoft: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)',
      // The live-progress chip is the one blue accent in the view. It must use
      // the business accent, not brand-primary: brand-primary is near-black in
      // the light theme and would turn the chip grey.
      accentEdge: 'color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)',
      // `--dsw-alias-brand-primary` inverts between themes (near-black in light,
      // near-white in dark), so text painted on it must use the paired
      // foreground token instead of a literal white.
      onAccent: 'var(--dsw-alias-label-primary-foreground)',
      buttonFill: 'var(--dsw-alias-button-primary-fill)',
      ink: 'var(--dsw-alias-label-primary)',
      ink2: 'var(--dsw-alias-label-secondary)',
      ink3: 'var(--dsw-alias-label-secondary)',
      // Reasoning reads as a footnote to the answer, so it sits one step
      // quieter than the body text.
      ink4: 'var(--dsw-alias-label-tertiary)',
      line: 'var(--dsw-alias-border-l2)',
      card: 'var(--dsw-alias-bg-layer-1)',
      // Floating surfaces (menus) take the overlay level: on a dark theme a
      // menu painted with the card colour would disappear into the card under
      // it, and this is the level the host reserves for exactly that case.
      overlay: 'var(--dsw-alias-bg-overlay)',
      cardEdge: 'var(--dsw-alias-border-l1)',
      canvas: 'var(--dsw-alias-bg-base)',
      code: 'var(--dsw-alias-markdown-code-block)',
      // A `label-primary` tint keeps the chip visible on a white card (the
      // markdown inline-code token is nearly white in the light theme).
      codeInline: 'color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent)',
      warn: 'var(--dsw-alias-state-error-primary)',
      ok: 'var(--dsw-alias-state-success-primary)',
    };
    const NODE_W = 320;
    const NODE_H = 212;
    const GAP_X = 44;
    const GAP_Y = 76;
    const LAYOUT_DIRECTION_KEY = 'dsh-explore:layout-direction';

    function readLayoutDirection() {
      try {
        return window.localStorage.getItem(LAYOUT_DIRECTION_KEY) === 'horizontal' ? 'horizontal' : 'vertical';
      } catch (error) {
        return 'vertical';
      }
    }

    function saveLayoutDirection(direction) {
      try {
        window.localStorage.setItem(LAYOUT_DIRECTION_KEY, direction);
      } catch (error) {
        /* Layout remains available for this view when storage is blocked. */
      }
    }

    // Font families follow Settings → Appearance. DSH composes the user's list
    // with its own default stack on body (`--dsw-font-family` /
    // `--ds-font-family-code`), so reading the composed tokens keeps glyph
    // fallback intact; the literal stacks are the fallback for a profile
    // without the theme plugin.
    const FONT = 'var(--dsw-font-family, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif)';
    const MONO = 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)';

    // ------------------------------------------------------------------ locale
    // Visible text must follow the shell language, so every string is a key
    // looked up through the Client locale service. The zh set is the source of
    // truth; en mirrors it key for key. Other registered languages fall back to
    // English through the service's own fallback chain.
    const NS = 'dsh-explore';

    const DICT = {
      zh: {
        'view.tab': '无限探索',
        'view.heading': '无限探索',
        'view.nodes': '{count} 个节点',
        'view.running': '{count} 条分支在跑',
        'view.runningTitle': '跳到下一条在跑的节点',
        'view.awaiting': '{count} 个在等你',
        'view.awaitingTitle': '跳到正在等你的节点',
        'view.loadOlder': '加载更早',
        'view.restoreHidden': '已隐藏 {count} 个 · 恢复',
        'view.restoreHiddenTitle': '恢复被删除的节点和分支',
        'view.searchPlaceholder': '搜索节点',
        'view.searchLabel': '搜索节点',
        'view.zoomGroup': '画布缩放',
        'view.zoomOut': '缩小画布',
        'view.zoomIn': '放大画布',
        'view.zoomLevel': '当前缩放比例',
        'view.layoutGroup': '布局方向',
        'view.layoutVertical': '上下布局',
        'view.layoutHorizontal': '左右布局',
        'view.layoutTitle': '切换左右布局和上下布局',
        'view.fit': '适应画布',
        'view.fitTitle': '缩放到能看见整棵树',
        'view.latest': '定位最新',
        'view.latestTitle': '展开路径并定位到最新创建的节点',
        'view.latestTitleEmpty': '还没有节点',
        'view.empty.title': '这棵树还是空的',
        'view.empty.hint': '回到 Chat 问一句，这里就会长出第一个节点。',
        'view.empty.report': '若已经问过却是空的，把这一行告我：事件 {events} · 会话 {state}。',

        'card.noQuestion': '（无问题）',
        'card.questionReply': '（回答上一轮的提问）',
        'card.latestBadge': '最新',
        'card.latestTitle': '这是最新创建的节点',
        'card.status.thinking': '思考中',
        'card.status.streaming': '回答中',
        'card.status.error': '出错',
        'card.status.stopped': '已中止',
        'card.status.done': '已完成',
        'card.status.awaiting': '等待回答',
        'card.status.awaitingApproval': '等待授权',
        'card.stop': '停止',
        'card.stopTitle': '停止这条分支',
        'card.ask': '在这条分支上继续追问',
        'card.more': '更多操作',
        'card.delete': '删除这个节点',
        'card.deleteTitle': '隐藏这个节点和它下面的所有分支',
        'card.deleteConfirm': '删除这个节点和它下面的所有分支？（随时可恢复）',
        'card.readTitle': '点击全屏阅读',
        'card.expandTitle': '展开整段回答',
        'card.collapseTitle': '收起这段回答',
        'card.expand': '展开回答',
        'card.collapse': '收起回答',
        'card.fullscreen': '全屏阅读',
        'card.fullscreenTitle': '全屏阅读完整回答',
        'card.unfoldBranch': '展开这一枝',
        'card.foldBranch': '收起这一枝',
        'card.unfoldDescendants': '展开 {count} 个后代',
        'card.foldDescendants': '收起 {count} 个后代',
        'card.descendants': '{count} 个后代',
        'card.truncated': '\n\n…（点开全屏看完整回答）',
        'card.cost.elapsed': '耗时 {value}',
        'card.cost.context': '上下文 {value}',
        'card.cost.cached': '缓存 {value}',

        'card.think': '思考过程',
        'card.thinkExpandTitle': '展开思考过程',
        'card.thinkCollapseTitle': '收起思考过程',
        'card.thinkMeta': '思考 {count} 字',
        'card.thinkTruncated': '（只保留了最新的 {count} 字思考）',

        'live.calling': '正在调用 {tool}',
        'live.outputting': '正在输出…',
        'live.thinking': '正在思考…',
        'live.starting': '正在开始…',
        'live.awaiting': '等你回答…',
        'live.awaitingApproval': '等你授权…',
        'live.step': '第 {step} 步',

        'composer.placeholder': '在这条分支上继续问…（Enter 发送，Shift+Enter 换行）',
        'composer.label': '追问内容',
        'composer.from': '从「{question}…」出发',
        'composer.cancel': '取消',
        'composer.send': '发送',

        'reader.close': '关闭（Esc）',
        'reader.closeLabel': '关闭阅读视图',
        'reader.noAnswer': '（还没有回答）',
        'reader.hint': 'Esc 关闭 · 点背景关闭',
        'reader.branch': '分支',
        'reader.mainline': '主线',

        'error.title': '树视图出错了',
        'error.reload': '重新载入视图',
        'error.hint': '画布数据没有丢，只是这一次渲染炸了。',

        'error.sessionNotOpen': '会话还没打开，无法投影。',
        'error.noBinding': '会话没有返回绑定',
        'error.openFailed': '打不开会话：{reason}',
        'error.forkFailed': '分叉失败：{reason}',
        'error.branchUnopenable': '无法打开分支会话：{reason}',
        'error.branchNoBinding': '打不开分支会话：{reason}',
        'error.branchNoUsableBinding': '分支会话没有返回可用的绑定。',
        'error.submitFailed': '提交失败：{reason}',
        'error.loadOlderFailed': '加载更早历史失败：{reason}',
      },

      en: {
        'view.tab': 'Infinite Exploration',
        'view.heading': 'Infinite Exploration',
        'view.nodes': '{count} nodes',
        'view.running': '{count} branches running',
        'view.runningTitle': 'Jump to the next running node',
        'view.awaiting': '{count} waiting on you',
        'view.awaitingTitle': 'Jump to the node waiting on you',
        'view.loadOlder': 'Load earlier',
        'view.restoreHidden': '{count} hidden · Restore',
        'view.restoreHiddenTitle': 'Restore deleted nodes and branches',
        'view.searchPlaceholder': 'Search nodes',
        'view.searchLabel': 'Search nodes',
        'view.zoomGroup': 'Canvas zoom',
        'view.zoomOut': 'Zoom out',
        'view.zoomIn': 'Zoom in',
        'view.zoomLevel': 'Current zoom level',
        'view.layoutGroup': 'Layout direction',
        'view.layoutVertical': 'Top to bottom',
        'view.layoutHorizontal': 'Left to right',
        'view.layoutTitle': 'Switch between left-to-right and top-to-bottom layouts',
        'view.fit': 'Fit canvas',
        'view.fitTitle': 'Zoom out to show the whole tree',
        'view.latest': 'Jump to latest',
        'view.latestTitle': 'Expand the path and jump to the newest node',
        'view.latestTitleEmpty': 'No nodes yet',
        'view.empty.title': 'This tree is still empty',
        'view.empty.hint': 'Ask something in Chat and the first node will grow here.',
        'view.empty.report': 'If you already asked and this is still empty, tell me: {events} events · session {state}.',

        'card.noQuestion': '(no question)',
        'card.questionReply': '(replying to the previous question)',
        'card.latestBadge': 'Latest',
        'card.latestTitle': 'The newest node in this tree',
        'card.status.thinking': 'Thinking',
        'card.status.streaming': 'Answering',
        'card.status.error': 'Error',
        'card.status.stopped': 'Stopped',
        'card.status.done': 'Done',
        'card.status.awaiting': 'Needs answer',
        'card.status.awaitingApproval': 'Needs approval',
        'card.stop': 'Stop',
        'card.stopTitle': 'Stop this branch',
        'card.ask': 'Follow up on this branch',
        'card.more': 'More actions',
        'card.delete': 'Delete this node',
        'card.deleteTitle': 'Hide this node and every branch under it',
        'card.deleteConfirm': 'Delete this node and all branches under it? (reversible)',
        'card.readTitle': 'Click to read in full screen',
        'card.expandTitle': 'Expand this answer',
        'card.collapseTitle': 'Collapse this answer',
        'card.expand': 'Expand answer',
        'card.collapse': 'Collapse answer',
        'card.fullscreen': 'Read full screen',
        'card.fullscreenTitle': 'Read the complete answer in full screen',
        'card.unfoldBranch': 'Expand this branch',
        'card.foldBranch': 'Collapse this branch',
        'card.unfoldDescendants': 'Expand {count} descendants',
        'card.foldDescendants': 'Collapse {count} descendants',
        'card.descendants': '{count} descendants',
        'card.truncated': '\n\n… (open full screen for the complete answer)',
        'card.cost.elapsed': 'took {value}',
        'card.cost.context': 'context {value}',
        'card.cost.cached': 'cached {value}',

        'card.think': 'Reasoning',
        'card.thinkExpandTitle': 'Expand the reasoning',
        'card.thinkCollapseTitle': 'Collapse the reasoning',
        'card.thinkMeta': '{count} chars of reasoning',
        'card.thinkTruncated': '(only the newest {count} chars of reasoning are kept)',

        'live.calling': 'Calling {tool}',
        'live.outputting': 'Writing…',
        'live.thinking': 'Thinking…',
        'live.starting': 'Starting…',
        'live.awaiting': 'Waiting for your answer…',
        'live.awaitingApproval': 'Waiting for your approval…',
        'live.step': 'step {step}',

        'composer.placeholder': 'Ask a follow-up on this branch… (Enter to send, Shift+Enter for a new line)',
        'composer.label': 'Follow-up text',
        'composer.from': 'Starting from "{question}…"',
        'composer.cancel': 'Cancel',
        'composer.send': 'Send',

        'reader.close': 'Close (Esc)',
        'reader.closeLabel': 'Close the reader',
        'reader.noAnswer': '(no answer yet)',
        'reader.hint': 'Esc or click the backdrop to close',
        'reader.branch': 'Branch',
        'reader.mainline': 'Main line',

        'error.title': 'The tree view crashed',
        'error.reload': 'Reload the view',
        'error.hint': 'The canvas data is safe; only this render failed.',

        'error.sessionNotOpen': 'The session is not open yet, so it cannot be projected.',
        'error.noBinding': 'The session returned no binding.',
        'error.openFailed': 'Could not open the session: {reason}',
        'error.forkFailed': 'Fork failed: {reason}',
        'error.branchUnopenable': 'Could not open the branch session: {reason}',
        'error.branchNoBinding': 'Could not open the branch session: {reason}',
        'error.branchNoUsableBinding': 'The branch session returned no usable binding.',
        'error.submitFailed': 'Submit failed: {reason}',
        'error.loadOlderFailed': 'Could not load earlier history: {reason}',
      },
      de: {
        'view.tab': 'Endlose Erkundung',
        'view.heading': 'Endlose Erkundung',
        'view.nodes': '{count} Knoten',
        'view.running': '{count} Zweige laufen',
        'view.runningTitle': 'Zum nächsten laufenden Knoten springen',
        'view.awaiting': '{count} warten auf dich',
        'view.awaitingTitle': 'Zum Knoten springen, der auf dich wartet',
        'view.loadOlder': 'Frühere laden',
        'view.restoreHidden': '{count} ausgeblendet · Wiederherstellen',
        'view.restoreHiddenTitle': 'Gelöschte Knoten und Zweige wiederherstellen',
        'view.searchPlaceholder': 'Knoten suchen',
        'view.searchLabel': 'Knoten suchen',
        'view.zoomGroup': 'Leinwand-Zoom',
        'view.zoomOut': 'Verkleinern',
        'view.zoomIn': 'Vergrößern',
        'view.zoomLevel': 'Aktuelle Zoomstufe',
        'view.layoutHorizontal': 'Links nach rechts',
        'view.layoutTitle': 'Zwischen Links-nach-rechts und Oben-nach-unten wechseln',
        'view.fit': 'Leinwand einpassen',
        'view.fitTitle': 'Herauszoomen, bis der ganze Baum sichtbar ist',
        'view.latest': 'Zum Neuesten',
        'view.latestTitle': 'Pfad ausklappen und zum neuesten Knoten springen',
        'view.latestTitleEmpty': 'Noch keine Knoten',
        'view.empty.title': 'Dieser Baum ist noch leer',
        'view.empty.hint': 'Stelle im Chat eine Frage, dann wächst hier der erste Knoten.',
        'view.empty.report': 'Wenn du schon gefragt hast und es hier noch leer ist, sag mir: {events} Ereignisse · Sitzung {state}.',
        'card.noQuestion': '(keine Frage)',
        'card.questionReply': '(Antwort auf die vorherige Frage)',
        'card.latestBadge': 'Neuestes',
        'card.latestTitle': 'Der neueste Knoten in diesem Baum',
        'card.status.thinking': 'Denkt nach',
        'card.status.streaming': 'Antwortet',
        'card.status.error': 'Fehler',
        'card.status.stopped': 'Angehalten',
        'card.status.done': 'Fertig',
        'card.status.awaiting': 'Braucht Antwort',
        'card.status.awaitingApproval': 'Braucht Freigabe',
        'card.stop': 'Stoppen',
        'card.stopTitle': 'Diesen Zweig stoppen',
        'card.ask': 'Auf diesem Zweig nachfragen',
        'card.more': 'Weitere Aktionen',
        'card.delete': 'Diesen Knoten löschen',
        'card.deleteTitle': 'Diesen Knoten und alle Zweige darunter ausblenden',
        'card.deleteConfirm': 'Diesen Knoten und alle Zweige darunter löschen? (umkehrbar)',
        'card.readTitle': 'Klicken, um im Vollbild zu lesen',
        'card.expandTitle': 'Diese Antwort ausklappen',
        'card.collapseTitle': 'Diese Antwort einklappen',
        'card.expand': 'Antwort ausklappen',
        'card.collapse': 'Antwort einklappen',
        'card.fullscreen': 'Vollbild lesen',
        'card.fullscreenTitle': 'Die vollständige Antwort im Vollbild lesen',
        'card.unfoldBranch': 'Diesen Zweig ausklappen',
        'card.foldBranch': 'Diesen Zweig einklappen',
        'card.unfoldDescendants': '{count} Nachfolger ausklappen',
        'card.foldDescendants': '{count} Nachfolger einklappen',
        'card.descendants': '{count} Nachfolger',
        'card.truncated': '\n\n… (im Vollbild die vollständige Antwort lesen)',
        'card.cost.elapsed': 'Dauer {value}',
        'card.cost.context': 'Kontext {value}',
        'card.cost.cached': 'Cache {value}',
        'card.think': 'Gedankengang',
        'card.thinkExpandTitle': 'Den Gedankengang ausklappen',
        'card.thinkCollapseTitle': 'Den Gedankengang einklappen',
        'card.thinkMeta': '{count} Zeichen Gedankengang',
        'card.thinkTruncated': '(nur die neuesten {count} Zeichen Gedankengang bleiben erhalten)',
        'live.calling': 'Ruft {tool} auf',
        'live.outputting': 'Schreibt…',
        'live.thinking': 'Denkt nach…',
        'live.starting': 'Startet…',
        'live.awaiting': 'Wartet auf deine Antwort…',
        'live.awaitingApproval': 'Wartet auf deine Freigabe…',
        'live.step': 'Schritt {step}',
        'composer.placeholder': 'Auf diesem Zweig nachfragen… (Enter senden, Shift+Enter neue Zeile)',
        'composer.label': 'Nachfrage',
        'composer.from': 'Ausgehend von „{question}…“',
        'composer.cancel': 'Abbrechen',
        'composer.send': 'Senden',
        'reader.close': 'Schließen (Esc)',
        'reader.closeLabel': 'Leser schließen',
        'reader.noAnswer': '(noch keine Antwort)',
        'reader.hint': 'Esc oder Klick auf den Hintergrund zum Schließen',
        'reader.branch': 'Zweig',
        'reader.mainline': 'Hauptlinie',
        'error.title': 'Die Baumansicht ist abgestürzt',
        'error.reload': 'Ansicht neu laden',
        'error.hint': 'Die Leinwand-Daten sind sicher; nur diese Darstellung ist fehlgeschlagen.',
        'error.sessionNotOpen': 'Die Sitzung ist noch nicht geöffnet und kann daher nicht projiziert werden.',
        'error.noBinding': 'Die Sitzung hat keine Bindung zurückgegeben.',
        'error.openFailed': 'Sitzung konnte nicht geöffnet werden: {reason}',
        'error.forkFailed': 'Fork fehlgeschlagen: {reason}',
        'error.branchUnopenable': 'Die Zweig-Sitzung konnte nicht geöffnet werden: {reason}',
        'error.branchNoBinding': 'Die Zweig-Sitzung konnte nicht geöffnet werden: {reason}',
        'error.branchNoUsableBinding': 'Die Zweig-Sitzung hat keine brauchbare Bindung zurückgegeben.',
        'error.submitFailed': 'Übermittlung fehlgeschlagen: {reason}',
        'error.loadOlderFailed': 'Frühere Verlaufsdaten konnten nicht geladen werden: {reason}',
        'view.layoutGroup': 'Layout-Richtung',
        'view.layoutVertical': 'Oben nach unten',
      },
      es: {
        'view.tab': 'Exploración infinita',
        'view.heading': 'Exploración infinita',
        'view.nodes': '{count} nodos',
        'view.running': '{count} ramas en curso',
        'view.runningTitle': 'Ir al siguiente nodo en curso',
        'view.awaiting': '{count} esperando tu respuesta',
        'view.awaitingTitle': 'Ir al nodo que espera tu respuesta',
        'view.loadOlder': 'Cargar anteriores',
        'view.restoreHidden': '{count} ocultos · Restaurar',
        'view.restoreHiddenTitle': 'Restaurar los nodos y ramas eliminados',
        'view.searchPlaceholder': 'Buscar nodos',
        'view.searchLabel': 'Buscar nodos',
        'view.zoomGroup': 'Zoom del lienzo',
        'view.zoomOut': 'Alejar',
        'view.zoomIn': 'Acercar',
        'view.zoomLevel': 'Nivel de zoom actual',
        'view.layoutHorizontal': 'De izquierda a derecha',
        'view.layoutTitle': 'Alternar entre diseño de izquierda a derecha y de arriba abajo',
        'view.fit': 'Ajustar lienzo',
        'view.fitTitle': 'Alejar hasta ver el árbol completo',
        'view.latest': 'Ir a lo más reciente',
        'view.latestTitle': 'Expandir la ruta e ir al nodo más reciente',
        'view.latestTitleEmpty': 'Aún no hay nodos',
        'view.empty.title': 'Este árbol aún está vacío',
        'view.empty.hint': 'Pregunta algo en Chat y el primer nodo crecerá aquí.',
        'view.empty.report': 'Si ya preguntaste y esto sigue vacío, dime: {events} eventos · sesión {state}.',
        'card.noQuestion': '(sin pregunta)',
        'card.questionReply': '(respondiendo a la pregunta anterior)',
        'card.latestBadge': 'Último',
        'card.latestTitle': 'El nodo más reciente de este árbol',
        'card.status.thinking': 'Pensando',
        'card.status.streaming': 'Respondiendo',
        'card.status.error': 'Error',
        'card.status.stopped': 'Detenido',
        'card.status.done': 'Listo',
        'card.status.awaiting': 'Necesita respuesta',
        'card.status.awaitingApproval': 'Necesita aprobación',
        'card.stop': 'Detener',
        'card.stopTitle': 'Detener esta rama',
        'card.ask': 'Seguir preguntando en esta rama',
        'card.more': 'Más acciones',
        'card.delete': 'Eliminar este nodo',
        'card.deleteTitle': 'Ocultar este nodo y todas las ramas que cuelgan de él',
        'card.deleteConfirm': '¿Eliminar este nodo y todas sus ramas? (reversible)',
        'card.readTitle': 'Haz clic para leer a pantalla completa',
        'card.expandTitle': 'Expandir esta respuesta',
        'card.collapseTitle': 'Contraer esta respuesta',
        'card.expand': 'Expandir respuesta',
        'card.collapse': 'Contraer respuesta',
        'card.fullscreen': 'Pantalla completa',
        'card.fullscreenTitle': 'Leer la respuesta completa a pantalla completa',
        'card.unfoldBranch': 'Expandir esta rama',
        'card.foldBranch': 'Contraer esta rama',
        'card.unfoldDescendants': 'Expandir {count} descendientes',
        'card.foldDescendants': 'Contraer {count} descendientes',
        'card.descendants': '{count} descendientes',
        'card.truncated': '\n\n… (abre a pantalla completa para ver la respuesta completa)',
        'card.cost.elapsed': 'duró {value}',
        'card.cost.context': 'contexto {value}',
        'card.cost.cached': 'caché {value}',
        'card.think': 'Razonamiento',
        'card.thinkExpandTitle': 'Expandir el razonamiento',
        'card.thinkCollapseTitle': 'Contraer el razonamiento',
        'card.thinkMeta': '{count} caracteres de razonamiento',
        'card.thinkTruncated': '(solo se conservan los {count} caracteres más recientes del razonamiento)',
        'live.calling': 'Llamando a {tool}',
        'live.outputting': 'Escribiendo…',
        'live.thinking': 'Pensando…',
        'live.starting': 'Iniciando…',
        'live.awaiting': 'Esperando tu respuesta…',
        'live.awaitingApproval': 'Esperando tu aprobación…',
        'live.step': 'paso {step}',
        'composer.placeholder': 'Pregunta de nuevo en esta rama… (Enter para enviar, Shift+Enter para nueva línea)',
        'composer.label': 'Texto de seguimiento',
        'composer.from': 'A partir de «{question}…»',
        'composer.cancel': 'Cancelar',
        'composer.send': 'Enviar',
        'reader.close': 'Cerrar (Esc)',
        'reader.closeLabel': 'Cerrar el lector',
        'reader.noAnswer': '(aún sin respuesta)',
        'reader.hint': 'Esc o clic en el fondo para cerrar',
        'reader.branch': 'Rama',
        'reader.mainline': 'Línea principal',
        'error.title': 'La vista de árbol falló',
        'error.reload': 'Recargar la vista',
        'error.hint': 'Los datos del lienzo están a salvo; solo falló este render.',
        'error.sessionNotOpen': 'La sesión aún no está abierta, así que no se puede proyectar.',
        'error.noBinding': 'La sesión no devolvió ninguna vinculación.',
        'error.openFailed': 'No se pudo abrir la sesión: {reason}',
        'error.forkFailed': 'Falló la bifurcación: {reason}',
        'error.branchUnopenable': 'No se pudo abrir la sesión de la rama: {reason}',
        'error.branchNoBinding': 'No se pudo abrir la sesión de la rama: {reason}',
        'error.branchNoUsableBinding': 'La sesión de la rama no devolvió una vinculación utilizable.',
        'error.submitFailed': 'No se pudo enviar: {reason}',
        'error.loadOlderFailed': 'No se pudo cargar el historial anterior: {reason}',
        'view.layoutGroup': 'Dirección del diseño',
        'view.layoutVertical': 'De arriba abajo',
      },
      fr: {
        'view.tab': 'Exploration infinie',
        'view.heading': 'Exploration infinie',
        'view.nodes': '{count} nœuds',
        'view.running': '{count} branches en cours',
        'view.runningTitle': 'Aller au prochain nœud en cours',
        'view.awaiting': '{count} en attente de vous',
        'view.awaitingTitle': 'Aller au nœud qui attend votre réponse',
        'view.loadOlder': 'Charger les précédents',
        'view.restoreHidden': '{count} masqués · Restaurer',
        'view.restoreHiddenTitle': 'Restaurer les nœuds et branches supprimés',
        'view.searchPlaceholder': 'Rechercher des nœuds',
        'view.searchLabel': 'Rechercher des nœuds',
        'view.zoomGroup': 'Zoom du canevas',
        'view.zoomOut': 'Dézoomer',
        'view.zoomIn': 'Zoomer',
        'view.zoomLevel': 'Niveau de zoom actuel',
        'view.layoutHorizontal': 'De gauche à droite',
        'view.layoutTitle': 'Basculer entre disposition de gauche à droite et de haut en bas',
        'view.fit': 'Ajuster le canevas',
        'view.fitTitle': 'Dézoomer pour afficher tout l’arbre',
        'view.latest': 'Aller au plus récent',
        'view.latestTitle': 'Déplier le chemin et aller au nœud le plus récent',
        'view.latestTitleEmpty': 'Aucun nœud pour l’instant',
        'view.empty.title': 'Cet arbre est encore vide',
        'view.empty.hint': 'Posez une question dans Chat et le premier nœud poussera ici.',
        'view.empty.report': 'Si vous avez déjà posé une question et que c’est toujours vide, dites-moi : {events} événements · session {state}.',
        'card.noQuestion': '(aucune question)',
        'card.questionReply': '(réponse à la question précédente)',
        'card.latestBadge': 'Dernier',
        'card.latestTitle': 'Le nœud le plus récent de cet arbre',
        'card.status.thinking': 'Réflexion',
        'card.status.streaming': 'Réponse en cours',
        'card.status.error': 'Erreur',
        'card.status.stopped': 'Arrêté',
        'card.status.done': 'Terminé',
        'card.status.awaiting': 'Réponse attendue',
        'card.status.awaitingApproval': 'Approbation attendue',
        'card.stop': 'Arrêter',
        'card.stopTitle': 'Arrêter cette branche',
        'card.ask': 'Relancer sur cette branche',
        'card.more': 'Plus d’actions',
        'card.delete': 'Supprimer ce nœud',
        'card.deleteTitle': 'Masquer ce nœud et toutes les branches en dessous',
        'card.deleteConfirm': 'Supprimer ce nœud et toutes les branches en dessous ? (réversible)',
        'card.readTitle': 'Cliquez pour lire en plein écran',
        'card.expandTitle': 'Déplier cette réponse',
        'card.collapseTitle': 'Replier cette réponse',
        'card.expand': 'Déplier la réponse',
        'card.collapse': 'Replier la réponse',
        'card.fullscreen': 'Plein écran',
        'card.fullscreenTitle': 'Lire la réponse complète en plein écran',
        'card.unfoldBranch': 'Déplier cette branche',
        'card.foldBranch': 'Replier cette branche',
        'card.unfoldDescendants': 'Déplier {count} descendants',
        'card.foldDescendants': 'Replier {count} descendants',
        'card.descendants': '{count} descendants',
        'card.truncated': '\n\n… (ouvrez le plein écran pour la réponse complète)',
        'card.cost.elapsed': 'durée {value}',
        'card.cost.context': 'contexte {value}',
        'card.cost.cached': 'cache {value}',
        'card.think': 'Raisonnement',
        'card.thinkExpandTitle': 'Déplier le raisonnement',
        'card.thinkCollapseTitle': 'Replier le raisonnement',
        'card.thinkMeta': '{count} caractères de raisonnement',
        'card.thinkTruncated': '(seuls les {count} derniers caractères du raisonnement sont conservés)',
        'live.calling': 'Appel de {tool}',
        'live.outputting': 'Écriture…',
        'live.thinking': 'En réflexion…',
        'live.starting': 'Démarrage…',
        'live.awaiting': 'En attente de votre réponse…',
        'live.awaitingApproval': 'En attente de votre approbation…',
        'live.step': 'étape {step}',
        'composer.placeholder': 'Relancer sur cette branche… (Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne)',
        'composer.label': 'Texte de suivi',
        'composer.from': 'À partir de « {question}… »',
        'composer.cancel': 'Annuler',
        'composer.send': 'Envoyer',
        'reader.close': 'Fermer (Échap)',
        'reader.closeLabel': 'Fermer le lecteur',
        'reader.noAnswer': '(pas encore de réponse)',
        'reader.hint': 'Échap ou clic sur l’arrière-plan pour fermer',
        'reader.branch': 'Branche',
        'reader.mainline': 'Ligne principale',
        'error.title': 'La vue arborescente a planté',
        'error.reload': 'Recharger la vue',
        'error.hint': 'Les données du canevas sont intactes ; seul ce rendu a échoué.',
        'error.sessionNotOpen': 'La session n’est pas encore ouverte ; elle ne peut donc pas être projetée.',
        'error.noBinding': 'La session n’a renvoyé aucune liaison.',
        'error.openFailed': 'Impossible d’ouvrir la session : {reason}',
        'error.forkFailed': 'Échec de l’embranchement : {reason}',
        'error.branchUnopenable': 'Impossible d’ouvrir la session de la branche : {reason}',
        'error.branchNoBinding': 'Impossible d’ouvrir la session de la branche : {reason}',
        'error.branchNoUsableBinding': 'La session de la branche n’a renvoyé aucune liaison utilisable.',
        'error.submitFailed': 'Échec de l’envoi : {reason}',
        'error.loadOlderFailed': 'Impossible de charger l’historique précédent : {reason}',
        'view.layoutGroup': 'Sens de la disposition',
        'view.layoutVertical': 'De haut en bas',
      },
      ja: {
        'view.tab': '無限探索',
        'view.heading': '無限探索',
        'view.nodes': '{count} 個のノード',
        'view.running': '{count} ブランチ実行中',
        'view.runningTitle': '次に実行中のノードへ移動',
        'view.awaiting': '{count} 件が対応待ち',
        'view.awaitingTitle': 'あなたの対応を待つノードへ移動',
        'view.loadOlder': '以前を読み込む',
        'view.restoreHidden': '{count} 件非表示 · 復元',
        'view.restoreHiddenTitle': '削除したノードとブランチを復元',
        'view.searchPlaceholder': 'ノードを検索',
        'view.searchLabel': 'ノードを検索',
        'view.zoomGroup': 'キャンバスのズーム',
        'view.zoomOut': '縮小',
        'view.zoomIn': '拡大',
        'view.zoomLevel': '現在のズーム率',
        'view.layoutHorizontal': '左右配置',
        'view.layoutTitle': '左右配置と上下配置を切り替える',
        'view.fit': 'キャンバスに合わせる',
        'view.fitTitle': 'ツリー全体が見えるまで縮小',
        'view.latest': '最新へ移動',
        'view.latestTitle': '経路を展開して最新のノードへ移動',
        'view.latestTitleEmpty': 'ノードはまだありません',
        'view.empty.title': 'このツリーはまだ空です',
        'view.empty.hint': 'Chat で質問すると、ここに最初のノードが生まれます。',
        'view.empty.report': 'すでに質問したのに空のままなら、次を伝えてください：イベント {events} · セッション {state}。',
        'card.noQuestion': '（質問なし）',
        'card.questionReply': '（前の質問への回答）',
        'card.latestBadge': '最新',
        'card.latestTitle': 'このツリーで最新のノード',
        'card.status.thinking': '思考中',
        'card.status.streaming': '回答中',
        'card.status.error': 'エラー',
        'card.status.stopped': '停止しました',
        'card.status.done': '完了',
        'card.status.awaiting': '回答待ち',
        'card.status.awaitingApproval': '承認待ち',
        'card.stop': '停止',
        'card.stopTitle': 'このブランチを停止',
        'card.ask': 'このブランチで追加質問',
        'card.more': 'その他の操作',
        'card.delete': 'このノードを削除',
        'card.deleteTitle': 'このノードとその下のすべてのブランチを非表示',
        'card.deleteConfirm': 'このノードとその下のすべてのブランチを削除しますか？（復元できます）',
        'card.readTitle': 'クリックして全画面で読む',
        'card.expandTitle': 'この回答を展開',
        'card.collapseTitle': 'この回答を折りたたむ',
        'card.expand': '回答を展開',
        'card.collapse': '回答を折りたたむ',
        'card.fullscreen': '全画面で読む',
        'card.fullscreenTitle': '完全な回答を全画面で読む',
        'card.unfoldBranch': 'このブランチを展開',
        'card.foldBranch': 'このブランチを折りたたむ',
        'card.unfoldDescendants': '子孫 {count} 件を展開',
        'card.foldDescendants': '子孫 {count} 件を折りたたむ',
        'card.descendants': '子孫 {count} 件',
        'card.truncated': '\n\n…（全画面で完全な回答を表示）',
        'card.cost.elapsed': '所要 {value}',
        'card.cost.context': 'コンテキスト {value}',
        'card.cost.cached': 'キャッシュ {value}',
        'card.think': '思考',
        'card.thinkExpandTitle': '思考を展開',
        'card.thinkCollapseTitle': '思考を折りたたむ',
        'card.thinkMeta': '思考 {count} 文字',
        'card.thinkTruncated': '（最新の思考 {count} 文字のみ保持）',
        'live.calling': '{tool} を呼び出し中',
        'live.outputting': '出力中…',
        'live.thinking': '考えています…',
        'live.starting': '開始中…',
        'live.awaiting': '回答をお待ちしています…',
        'live.awaitingApproval': '承認をお待ちしています…',
        'live.step': 'ステップ {step}',
        'composer.placeholder': 'このブランチで追加質問…（Enter で送信、Shift+Enter で改行）',
        'composer.label': '追加質問の内容',
        'composer.from': '「{question}…」から開始',
        'composer.cancel': 'キャンセル',
        'composer.send': '送信',
        'reader.close': '閉じる（Esc）',
        'reader.closeLabel': 'リーダーを閉じる',
        'reader.noAnswer': '（まだ回答はありません）',
        'reader.hint': 'Esc または背景をクリックで閉じる',
        'reader.branch': 'ブランチ',
        'reader.mainline': '本線',
        'error.title': 'ツリービューでエラーが発生しました',
        'error.reload': 'ビューを再読み込み',
        'error.hint': 'キャンバスのデータは失われていません。描画だけが失敗しました。',
        'error.sessionNotOpen': 'セッションがまだ開いていないため、投影できません。',
        'error.noBinding': 'セッションからバインディングが返されませんでした。',
        'error.openFailed': 'セッションを開けませんでした：{reason}',
        'error.forkFailed': 'フォークに失敗しました：{reason}',
        'error.branchUnopenable': 'ブランチセッションを開けませんでした：{reason}',
        'error.branchNoBinding': 'ブランチセッションを開けませんでした：{reason}',
        'error.branchNoUsableBinding': 'ブランチセッションから使用可能なバインディングが返されませんでした。',
        'error.submitFailed': '送信に失敗しました：{reason}',
        'error.loadOlderFailed': '以前の履歴を読み込めませんでした：{reason}',
        'view.layoutGroup': 'レイアウト方向',
        'view.layoutVertical': '上から下',
      },
      pt: {
        'view.tab': 'Exploração infinita',
        'view.heading': 'Exploração infinita',
        'view.nodes': '{count} nós',
        'view.running': '{count} ramos em execução',
        'view.runningTitle': 'Ir para o próximo nó em execução',
        'view.awaiting': '{count} aguardando você',
        'view.awaitingTitle': 'Ir para o nó que aguarda você',
        'view.loadOlder': 'Carregar anteriores',
        'view.restoreHidden': '{count} ocultos · Restaurar',
        'view.restoreHiddenTitle': 'Restaurar nós e ramos excluídos',
        'view.searchPlaceholder': 'Buscar nós',
        'view.searchLabel': 'Buscar nós',
        'view.zoomGroup': 'Zoom do canvas',
        'view.zoomOut': 'Afastar',
        'view.zoomIn': 'Aproximar',
        'view.zoomLevel': 'Nível de zoom atual',
        'view.layoutHorizontal': 'Da esquerda para a direita',
        'view.layoutTitle': 'Alternar entre layout da esquerda para a direita e de cima para baixo',
        'view.fit': 'Ajustar canvas',
        'view.fitTitle': 'Afastar até mostrar a árvore inteira',
        'view.latest': 'Ir para o mais recente',
        'view.latestTitle': 'Expandir o caminho e ir para o nó mais recente',
        'view.latestTitleEmpty': 'Ainda não há nós',
        'view.empty.title': 'Esta árvore ainda está vazia',
        'view.empty.hint': 'Pergunte algo no Chat e o primeiro nó vai crescer aqui.',
        'view.empty.report': 'Se você já perguntou e isto continua vazio, me diga: {events} eventos · sessão {state}.',
        'card.noQuestion': '(sem pergunta)',
        'card.questionReply': '(respondendo à pergunta anterior)',
        'card.latestBadge': 'Recente',
        'card.latestTitle': 'O nó mais recente desta árvore',
        'card.status.thinking': 'Pensando',
        'card.status.streaming': 'Respondendo',
        'card.status.error': 'Erro',
        'card.status.stopped': 'Interrompido',
        'card.status.done': 'Concluído',
        'card.status.awaiting': 'Aguardando resposta',
        'card.status.awaitingApproval': 'Aguardando aprovação',
        'card.stop': 'Parar',
        'card.stopTitle': 'Parar este ramo',
        'card.ask': 'Perguntar novamente neste ramo',
        'card.more': 'Mais ações',
        'card.delete': 'Excluir este nó',
        'card.deleteTitle': 'Ocultar este nó e todos os ramos abaixo dele',
        'card.deleteConfirm': 'Excluir este nó e todos os ramos abaixo dele? (reversível)',
        'card.readTitle': 'Clique para ler em tela cheia',
        'card.expandTitle': 'Expandir esta resposta',
        'card.collapseTitle': 'Recolher esta resposta',
        'card.expand': 'Expandir resposta',
        'card.collapse': 'Recolher resposta',
        'card.fullscreen': 'Tela cheia',
        'card.fullscreenTitle': 'Ler a resposta completa em tela cheia',
        'card.unfoldBranch': 'Expandir este ramo',
        'card.foldBranch': 'Recolher este ramo',
        'card.unfoldDescendants': 'Expandir {count} descendentes',
        'card.foldDescendants': 'Recolher {count} descendentes',
        'card.descendants': '{count} descendentes',
        'card.truncated': '\n\n… (abra em tela cheia para ver a resposta completa)',
        'card.cost.elapsed': 'levou {value}',
        'card.cost.context': 'contexto {value}',
        'card.cost.cached': 'cache {value}',
        'card.think': 'Raciocínio',
        'card.thinkExpandTitle': 'Expandir o raciocínio',
        'card.thinkCollapseTitle': 'Recolher o raciocínio',
        'card.thinkMeta': '{count} caracteres de raciocínio',
        'card.thinkTruncated': '(apenas os {count} caracteres mais recentes do raciocínio são mantidos)',
        'live.calling': 'Chamando {tool}',
        'live.outputting': 'Escrevendo…',
        'live.thinking': 'Pensando…',
        'live.starting': 'Iniciando…',
        'live.awaiting': 'Aguardando sua resposta…',
        'live.awaitingApproval': 'Aguardando sua aprovação…',
        'live.step': 'etapa {step}',
        'composer.placeholder': 'Pergunte novamente neste ramo… (Enter para enviar, Shift+Enter para nova linha)',
        'composer.label': 'Texto da pergunta',
        'composer.from': 'A partir de “{question}…”',
        'composer.cancel': 'Cancelar',
        'composer.send': 'Enviar',
        'reader.close': 'Fechar (Esc)',
        'reader.closeLabel': 'Fechar o leitor',
        'reader.noAnswer': '(ainda sem resposta)',
        'reader.hint': 'Esc ou clique no fundo para fechar',
        'reader.branch': 'Ramo',
        'reader.mainline': 'Linha principal',
        'error.title': 'A visualização em árvore falhou',
        'error.reload': 'Recarregar a visualização',
        'error.hint': 'Os dados do canvas estão seguros; apenas esta renderização falhou.',
        'error.sessionNotOpen': 'A sessão ainda não está aberta, então não pode ser projetada.',
        'error.noBinding': 'A sessão não retornou nenhuma vinculação.',
        'error.openFailed': 'Não foi possível abrir a sessão: {reason}',
        'error.forkFailed': 'Falha na bifurcação: {reason}',
        'error.branchUnopenable': 'Não foi possível abrir a sessão do ramo: {reason}',
        'error.branchNoBinding': 'Não foi possível abrir a sessão do ramo: {reason}',
        'error.branchNoUsableBinding': 'A sessão do ramo não retornou uma vinculação utilizável.',
        'error.submitFailed': 'Falha no envio: {reason}',
        'error.loadOlderFailed': 'Não foi possível carregar o histórico anterior: {reason}',
        'view.layoutGroup': 'Direção do layout',
        'view.layoutVertical': 'De cima para baixo',
      },
      ru: {
        'view.tab': 'Бесконечное исследование',
        'view.heading': 'Бесконечное исследование',
        'view.nodes': 'Узлов: {count}',
        'view.running': 'Ветки в работе: {count}',
        'view.runningTitle': 'Перейти к следующему работающему узлу',
        'view.awaiting': 'Ждут вас: {count}',
        'view.awaitingTitle': 'Перейти к узлу, который ждёт вас',
        'view.loadOlder': 'Загрузить ранее',
        'view.restoreHidden': 'Скрыто {count} · Восстановить',
        'view.restoreHiddenTitle': 'Восстановить удалённые узлы и ветки',
        'view.searchPlaceholder': 'Поиск узлов',
        'view.searchLabel': 'Поиск узлов',
        'view.zoomGroup': 'Масштаб холста',
        'view.zoomOut': 'Уменьшить',
        'view.zoomIn': 'Увеличить',
        'view.zoomLevel': 'Текущий масштаб',
        'view.layoutHorizontal': 'Слева направо',
        'view.layoutTitle': 'Переключить раскладку слева направо и сверху вниз',
        'view.fit': 'Вписать холст',
        'view.fitTitle': 'Уменьшить, чтобы показать всё дерево',
        'view.latest': 'К последнему',
        'view.latestTitle': 'Развернуть путь и перейти к новейшему узлу',
        'view.latestTitleEmpty': 'Узлов пока нет',
        'view.empty.title': 'Это дерево пока пустое',
        'view.empty.hint': 'Спросите что-нибудь в Chat, и здесь появится первый узел.',
        'view.empty.report': 'Если вы уже спрашивали, а здесь по-прежнему пусто, сообщите: события {events} · сеанс {state}.',
        'card.noQuestion': '(без вопроса)',
        'card.questionReply': '(ответ на предыдущий вопрос)',
        'card.latestBadge': 'Последний',
        'card.latestTitle': 'Самый новый узел в этом дереве',
        'card.status.thinking': 'Думает',
        'card.status.streaming': 'Отвечает',
        'card.status.error': 'Ошибка',
        'card.status.stopped': 'Остановлено',
        'card.status.done': 'Готово',
        'card.status.awaiting': 'Нужен ответ',
        'card.status.awaitingApproval': 'Нужно подтверждение',
        'card.stop': 'Остановить',
        'card.stopTitle': 'Остановить эту ветку',
        'card.ask': 'Задать вопрос на этой ветке',
        'card.more': 'Ещё действия',
        'card.delete': 'Удалить этот узел',
        'card.deleteTitle': 'Скрыть этот узел и все ветки под ним',
        'card.deleteConfirm': 'Удалить этот узел и все ветки под ним? (обратимо)',
        'card.readTitle': 'Нажмите, чтобы читать на весь экран',
        'card.expandTitle': 'Развернуть этот ответ',
        'card.collapseTitle': 'Свернуть этот ответ',
        'card.expand': 'Развернуть ответ',
        'card.collapse': 'Свернуть ответ',
        'card.fullscreen': 'Во весь экран',
        'card.fullscreenTitle': 'Прочитать полный ответ во весь экран',
        'card.unfoldBranch': 'Развернуть эту ветку',
        'card.foldBranch': 'Свернуть эту ветку',
        'card.unfoldDescendants': 'Развернуть {count} потомков',
        'card.foldDescendants': 'Свернуть {count} потомков',
        'card.descendants': 'Потомков: {count}',
        'card.truncated': '\n\n… (откройте на весь экран, чтобы прочитать полный ответ)',
        'card.cost.elapsed': 'заняло {value}',
        'card.cost.context': 'контекст {value}',
        'card.cost.cached': 'кэш {value}',
        'card.think': 'Рассуждения',
        'card.thinkExpandTitle': 'Развернуть рассуждения',
        'card.thinkCollapseTitle': 'Свернуть рассуждения',
        'card.thinkMeta': 'Рассуждения: {count} симв.',
        'card.thinkTruncated': '(сохранены только последние {count} симв. рассуждений)',
        'live.calling': 'Вызов {tool}',
        'live.outputting': 'Пишет…',
        'live.thinking': 'Думает…',
        'live.starting': 'Запуск…',
        'live.awaiting': 'Ждёт вашего ответа…',
        'live.awaitingApproval': 'Ждёт вашего подтверждения…',
        'live.step': 'шаг {step}',
        'composer.placeholder': 'Задайте уточнение на этой ветке… (Enter — отправить, Shift+Enter — новая строка)',
        'composer.label': 'Текст уточнения',
        'composer.from': 'Начиная с «{question}…»',
        'composer.cancel': 'Отмена',
        'composer.send': 'Отправить',
        'reader.close': 'Закрыть (Esc)',
        'reader.closeLabel': 'Закрыть режим чтения',
        'reader.noAnswer': '(ответа пока нет)',
        'reader.hint': 'Esc или клик по фону, чтобы закрыть',
        'reader.branch': 'Ветка',
        'reader.mainline': 'Основная линия',
        'error.title': 'Древовидное представление упало',
        'error.reload': 'Перезагрузить представление',
        'error.hint': 'Данные холста не потеряны; не удалась только эта отрисовка.',
        'error.sessionNotOpen': 'Сеанс ещё не открыт, поэтому его нельзя спроецировать.',
        'error.noBinding': 'Сеанс не вернул привязку.',
        'error.openFailed': 'Не удалось открыть сеанс: {reason}',
        'error.forkFailed': 'Не удалось создать ответвление: {reason}',
        'error.branchUnopenable': 'Не удалось открыть сеанс ветки: {reason}',
        'error.branchNoBinding': 'Не удалось открыть сеанс ветки: {reason}',
        'error.branchNoUsableBinding': 'Сеанс ветки не вернул пригодную привязку.',
        'error.submitFailed': 'Не удалось отправить: {reason}',
        'error.loadOlderFailed': 'Не удалось загрузить более раннюю историю: {reason}',
        'view.layoutGroup': 'Направление макета',
        'view.layoutVertical': 'Сверху вниз',
      },
    };

    const localeListeners = new Set();

    /** Look a key up in the built-in table when the locale service is absent. */
    function fallbackTranslate(key, params) {
      const raw = typeof document !== 'undefined' && document.documentElement.lang
        ? String(document.documentElement.lang)
        : 'zh';
      // `pt-BR` and `zh-CN` are the same table as `pt` and `zh`; the region
      // subtag only matters to the locale service, not to our flat keys.
      const lang = raw.toLowerCase().split(/[-_]/)[0];
      const table = DICT[lang] || DICT.en;
      const template = table[key] ?? DICT.en[key] ?? DICT.zh[key] ?? key;
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
    }

    /** The live translator; `apply` upgrades it to the locale service. */
    const localeBridge = {
      translate: fallbackTranslate,
    };

    /** Translate a key; call inside components so a locale switch re-renders. */
    function T(key, params) {
      return localeBridge.translate(key, params);
    }

    /** Re-render the caller whenever the active language changes. */
    function useLocale() {
      const [, force] = useState(0);
      useEffect(() => {
        const listener = () => force((n) => n + 1);
        localeListeners.add(listener);
        return () => localeListeners.delete(listener);
      }, []);
    }


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

    // ---------------------------------------------------------------- reasoning
    // The model writes its thinking as `reasoning` content blocks: live as a
    // `reasoning-delta` chunk, and settled as a `{ type: 'reasoning', text }`
    // block inside the durable `assistant/message`. Both reach a client plugin
    // through the same event window, so one accumulator serves the running tail
    // and the finished transcript.
    //
    // A provider that does not think emits no reasoning at all — the card then
    // simply has nothing to show, which is why the section is hidden rather
    // than rendered empty.

    /** The reasoning blocks inside one assistant message, in order. */
    function reasoningBlocksOfMessage(message) {
      const content = message && message.content;
      if (!Array.isArray(content)) return [];
      const blocks = [];
      for (const block of content) {
        if (block && block.type === 'reasoning' && typeof block.text === 'string' && block.text.trim()) {
          blocks.push(block.text);
        }
      }
      return blocks;
    }

    /**
     * The key of one reasoning block inside one step.
     *
     * The host frames both the live chunks and the settled message with the
     * same `turn` and `step`, and a step can hold several reasoning blocks
     * (one per content-block index). The index is part of the key so two
     * blocks in the same step do not overwrite each other.
     */
    function reasoningKey(turn, step, index) {
      const base = reasoningStepPrefix(turn, step);
      return typeof index === 'number' ? base + index : base;
    }

    /**
     * The prefix every reasoning block of one step shares.
     *
     * The trailing separator is what makes the prefix safe: without it, step
     * `1` of turn `1` would also match step `11` of turn `1`.
     */
    function reasoningStepPrefix(turn, step) {
      const base = typeof turn === 'number' && typeof step === 'number'
        ? turn + ':' + step + '#'
        : 'unknown#';
      return base;
    }

    /**
     * The cap on how much reasoning a card keeps.
     *
     * A long agent turn can think for hundreds of kilobytes. The card shows
     * the newest thinking, so the cap keeps the *tail*: the oldest paragraphs
     * are dropped, and the fact that something was dropped is recorded so the
     * reader knows the text is not the whole story.
     *
     * The cap is enforced inside the accumulator rather than at render time,
     * so a streaming turn never builds a string larger than this.
     */
    const REASONING_LIMIT = 12000;

    /**
     * A fresh reasoning accumulator: one segment per reasoning block.
     *
     * `received` records how many characters each block ever delivered. The
     * amount dropped is *derived* from it (`received - kept`) rather than
     * accumulated as a counter: a block is trimmed more than once in normal
     * use — once while it streams, again when its settled block replaces the
     * streamed draft — so a running counter would report the same characters
     * as dropped twice, and would keep claiming a loss after a settled block
     * replaced a long draft with a short one.
     */
    function reasoningState() {
      return { segments: new Map(), received: new Map() };
    }

    /**
     * Count the bytes of a streamed fragment as arrived.
     *
     * This must be an addition, not a maximum of the kept length: the trim
     * cuts the fragment back off immediately, so `kept` plateaus at the cap
     * and a "max kept" would report one chunk's worth of loss for a turn that
     * actually dropped tens of kilobytes.
     */
    function addReceived(state, key, length) {
      state.received.set(key, (state.received.get(key) || 0) + length);
    }

    /**
     * The two reasoning fields a card needs: the kept text, and how much the
     * cap dropped. Keeping them separate lets a collapsed row admit that the
     * text is partial without gluing a notice onto the reasoning itself.
     */
    function reasoningFieldsOf(state) {
      return {
        reasoning: reasoningTextOf(state),
        reasoningDropped: droppedReasoningOf(state),
      };
    }

    /** Whether a chunk belongs to the model's reasoning. */
    function isReasoningChunk(chunk) {
      if (!chunk) return false;
      if (chunk.type === 'reasoning-delta') return true;
      if (chunk.type === 'block-end') return Boolean(chunk.block && chunk.block.type === 'reasoning');
      if (chunk.type === 'block-start') return chunk.blockType === 'reasoning';
      return false;
    }

    /**
     * Fold one live chunk into a reasoning accumulator.
     *
     * `reasoning-delta` appends to the block's segment; `block-end` replaces it
     * with the block the host settled.
     */
    function applyReasoningChunk(state, chunk, turn, step) {
      if (!chunk) return state;
      const index = typeof chunk.index === 'number' ? chunk.index : undefined;
      const key = reasoningKey(turn, step, index);
      if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') {
        const previous = state.segments.get(key);
        state.segments.set(key, (previous || '') + chunk.text);
        // Bytes arrived, however much the trim keeps of them.
        addReceived(state, key, chunk.text.length);
        trimReasoning(state);
        return state;
      }
      if (chunk.type === 'block-end' && chunk.block && chunk.block.type === 'reasoning'
        && typeof chunk.block.text === 'string' && chunk.block.text.trim()) {
        // The settled block is the authoritative full text of this block, so
        // it replaces both the streamed draft and its arrived-bytes tally.
        // An empty block says nothing and must not wipe what arrived.
        state.segments.set(key, chunk.block.text);
        state.received.set(key, chunk.block.text.length);
        trimReasoning(state);
        return state;
      }
      if (chunk.type === 'block-start' && chunk.blockType === 'reasoning') {
        if (!state.segments.has(key)) state.segments.set(key, '');
      }
      return state;
    }

    /**
     * Merge one settled step's reasoning into the accumulator.
     *
     * The settled blocks are that step's complete thinking, so they replace
     * what was streamed for the step instead of being appended to it.
     * Transient chunks are retired when the step settles, so the durable
     * message is the only reliable source once it has landed.
     */
    function mergeSettledReasoning(state, blocks, turn, step) {
      if (!Array.isArray(blocks) || !blocks.length) return state;
      // Replace the whole step: the settled blocks are the step's final
      // thinking, and the streamed draft for them is gone by now. The
      // `received` marks go with them, so a short settled block does not
      // inherit the draft's dropped-chars claim.
      const prefix = reasoningStepPrefix(turn, step);
      for (const key of [...state.segments.keys()]) {
        if (key.startsWith(prefix)) state.segments.delete(key);
      }
      for (const key of [...state.received.keys()]) {
        if (key.startsWith(prefix)) state.received.delete(key);
      }
      blocks.forEach((text, index) => {
        if (typeof text !== 'string' || !text.trim()) return;
        const key = reasoningKey(turn, step, index);
        state.segments.set(key, text);
        // The settled block is the truth for this block, so it replaces the
        // streamed tally rather than adding to it.
        state.received.set(key, text.length);
      });
      trimReasoning(state);
      return state;
    }

    /**
     * Drop the reasoning of a retried step.
     *
     * A retry reuses the same turn and step, so the failed attempt's thinking
     * would otherwise be concatenated with the successful one. The attempt
     * that is about to run starts from a clean slate, which is what the
     * official Trajectory view does too.
     */
    function resetStepReasoning(state, turn, step) {
      if (!state) return state;
      const prefix = reasoningStepPrefix(turn, step);
      for (const key of [...state.segments.keys()]) {
        if (key.startsWith(prefix)) state.segments.delete(key);
      }
      for (const key of [...state.received.keys()]) {
        if (key.startsWith(prefix)) state.received.delete(key);
      }
      return state;
    }

    /**
     * Drop the oldest reasoning until the accumulator fits the cap.
     *
     * The oldest block goes first: the reader cares about what the agent is
     * doing now, and the newest blocks are the ones still in play. Trimming
     * only shortens the kept text — how much was dropped is derived later
     * from `received`, so trimming twice never double-counts.
     */
    function trimReasoning(state) {
      let total = 0;
      for (const text of state.segments.values()) total += text.length;
      if (total <= REASONING_LIMIT) return;
      for (const [key, text] of state.segments) {
        if (total <= REASONING_LIMIT) break;
        const excess = total - REASONING_LIMIT;
        const cut = Math.min(text.length, excess);
        if (cut <= 0) continue;
        state.segments.set(key, text.slice(cut));
        total -= cut;
      }
    }

    /** How many characters the cap has dropped, derived from what arrived. */
    function droppedReasoningOf(state) {
      if (!state || !state.segments || !state.received) return 0;
      let dropped = 0;
      for (const [key, text] of state.segments) {
        const received = state.received.get(key) || text.length;
        if (received > text.length) dropped += received - text.length;
      }
      return dropped;
    }

    /**
     * The accumulated reasoning, one block's thinking per paragraph group.
     *
     * The dropped-chars count is *not* baked into this string: the card needs
     * it as metadata so a collapsed row can still say the text is partial,
     * and the reader wants the reasoning itself, not a notice glued to it.
     */
    function reasoningTextOf(state) {
      if (!state || !state.segments) return '';
      const parts = [];
      for (const text of state.segments.values()) {
        if (text && text.trim()) parts.push(text);
      }
      return parts.join('\n\n');
    }

    /**
     * The one-line summary of a reasoning text: the first line of its last
     * paragraph.
     *
     * A collapsed section shows this so the reader learns what the agent was
     * up to without opening anything. It is deliberately *not* a copy of the
     * official Chat row, which picks the last completed paragraph's first line
     * only while streaming and the first line of the whole text once settled.
     */
    function reasoningPreview(text) {
      if (!text) return '';
      const source = String(text);
      // The last paragraph is the freshest thought; take its first line.
      const paragraphs = source.split(/\r?\n[\t ]*\r?\n/);
      const last = paragraphs[paragraphs.length - 1] || '';
      const firstLine = last.split(/\r?\n/).find((line) => line.trim());
      const chosen = firstLine ? firstLine.trim() : '';
      return chosen.replace(/\*\*/g, '').slice(0, 200);
    }

    /**
     * The newest thing the model wrote, in one line.
     *
     * While a branch runs this is the only honest answer to "what is it
     * doing right now": the most recent line of its thinking, not a summary
     * of a paragraph it started a while ago.
     */
    function reasoningTail(text) {
      if (!text) return '';
      const lines = String(text).split(/\r?\n/);
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const trimmed = lines[index].trim();
        if (!trimmed) continue;
        return trimmed.replace(/\*\*/g, '').slice(0, 200);
      }
      return '';
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

    // The host names a human prompt `source.kind: 'user'` (the `user-rpc` source
    // key carries that same kind, and a slash command is still `'user'`), and a
    // steer that answers a pending question `'user-question-reply'`. The old
    // list held `user-rpc` / `user_command` / `command`, which are not `kind`
    // values the host ever emits, so those turns — every question reply included
    // — were projected away entirely.
    const PROMPT_KINDS = ['user', 'user-question-reply'];

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

    /** A question reply is a JSON envelope; surface the question, not the blob. */
    function questionReplyTextOf(data) {
      const raw = textOf(data.content).trim();
      if (!raw) return '';
      try {
        const parsed = JSON.parse(raw);
        const questions = parsed && parsed.questions;
        if (Array.isArray(questions) && questions[0] && typeof questions[0].question === 'string') {
          return questions[0].question;
        }
      } catch (error) {
        /* not the envelope: keep whatever text the host wrote */
      }
      return raw;
    }

    /** Fold a session's event window into question/answer turns. */
    function projectTurns(entries, sessionRunning) {
      const turns = [];
      let current = null;
      // Reasoning is accumulated across the whole turn: a turn is one user
      // question and the model may think in several steps before answering.
      let reasoning = reasoningState();
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
            } else if (chunk && isReasoningChunk(chunk)) {
              // Only reasoning chunks touch the reasoning text: a text or
              // tool-call token must not rebuild a multi-kilobyte string.
              // The host frames a chunk with the same turn/step as the
              // message that will settle it.
              applyReasoningChunk(reasoning, chunk, data.turn, data.step);
              Object.assign(current, reasoningFieldsOf(reasoning));
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
            awaiting: '', pendingQuestions: new Set(), pendingApprovals: new Set(),
            reasoning: '',
          };
          reasoning = reasoningState();
          turns.push(current);
        } else if (event.type === 'step/start') {
          if (current) current.step = typeof data.step === 'number' ? data.step : current.step + 1;
        } else if (event.type === 'llm/retry' || event.type === 'llm/retry-started') {
          // A retry reuses the same turn and step, so the failed attempt's
          // thinking has to go before the new attempt's arrives.
          resetStepReasoning(reasoning, data.turn, data.step);
          if (current) Object.assign(current, reasoningFieldsOf(reasoning));
        } else if (event.type === 'tool/call') {
          if (current) {
            if (data.name) current.tool = String(data.name);
            // A pending ask_user_question leaves only this call in the log: the
            // turn cannot end while the tool awaits the human, so the call is
            // the whole signal that the branch is blocked on the user.
            if (data.name === 'ask_user_question' && data.callId) {
              current.pendingQuestions.add(String(data.callId));
            }
          }
        } else if (event.type === 'tool/result') {
          if (current) {
            current.tool = '';
            const settled = data.message && data.message.toolCallId;
            if (settled) current.pendingQuestions.delete(String(settled));
            else if (current.pendingQuestions.size) current.pendingQuestions.clear();
          }
        } else if (event.type === 'approval/asked') {
          const target = current || turns[turns.length - 1];
          if (target && data.id) target.pendingApprovals.add(String(data.id));
        } else if (event.type === 'approval/decided') {
          const target = current || turns[turns.length - 1];
          if (target && data.id) target.pendingApprovals.delete(String(data.id));
        } else if (event.type === 'user/message') {
          const target = current || turns[turns.length - 1];
          if (target) {
            const text = textOf(data.content);
            if (text.trim() && isRealPrompt(data)) {
              const kind = sourceKindOf(data) || '';
              target.question = kind === 'user-question-reply'
                ? (questionReplyTextOf(data) || T('card.questionReply'))
                : text;
              target.real = true;
              target.kind = kind;
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
            // The settled message carries the step's reasoning blocks.
            const settled = reasoningBlocksOfMessage(data.message);
            if (settled.length) {
              mergeSettledReasoning(reasoning, settled, data.turn, data.step);
              Object.assign(target, reasoningFieldsOf(reasoning));
            }
            target.answerSeq = typeof event.seq === 'number' ? event.seq : target.answerSeq;
          }
        } else if (event.type === 'turn/end') {
          const target = current || turns[turns.length - 1];
          if (target) {
            target.status = target.answer ? 'done' : 'stopped';
            target.tool = '';
            target.streamText = '';
            target.awaiting = '';
            target.pendingQuestions.clear();
            target.pendingApprovals.clear();
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
      // "Waiting on you" is only true while the turn is genuinely open: the host
      // appends no turn/end while ask_user_question (or an approval) blocks, and
      // keeps reporting the session as running.
      for (const turn of turns) {
        turn.awaiting = turn.status === 'running'
          ? (turn.pendingQuestions.size ? 'question' : turn.pendingApprovals.size ? 'approval' : '')
          : '';
        delete turn.pendingQuestions;
        delete turn.pendingApprovals;
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
      const pendingQuestions = new Set();
      const pendingApprovals = new Set();
      // A branch reasons over its own steps, exactly like the mainline.
      const reasoning = reasoningState();
      const cost = turnCost(entries, baseline);
      for (const entry of entries) {
        const event = entry && entry.event;
        if (!event) continue;
        if (entry.type === 'transient') {
          if (event.type === 'assistant/live-chunk' && seqOf(entry) > baseline) {
            const data = event.data || {};
            const chunk = data.chunk;
            if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text;
            else if (isReasoningChunk(chunk)) applyReasoningChunk(reasoning, chunk, data.turn, data.step);
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
          pendingQuestions.clear();
          pendingApprovals.clear();
        } else if (event.type === 'step/start') {
          const data = event.data || {};
          step = typeof data.step === 'number' ? data.step : step + 1;
        } else if (event.type === 'llm/retry' || event.type === 'llm/retry-started') {
          // A retry reuses the same turn and step, so the failed attempt's
          // thinking has to go before the new attempt's arrives.
          const data = event.data || {};
          resetStepReasoning(reasoning, data.turn, data.step);
        } else if (event.type === 'tool/call') {
          const data = event.data || {};
          if (data.name) tool = String(data.name);
          if (data.name === 'ask_user_question' && data.callId) pendingQuestions.add(String(data.callId));
        } else if (event.type === 'tool/result') {
          tool = '';
          const data = event.data || {};
          const settled = data.message && data.message.toolCallId;
          if (settled) pendingQuestions.delete(String(settled));
          else if (pendingQuestions.size) pendingQuestions.clear();
        } else if (event.type === 'approval/asked') {
          const data = event.data || {};
          if (data.id) pendingApprovals.add(String(data.id));
        } else if (event.type === 'approval/decided') {
          const data = event.data || {};
          if (data.id) pendingApprovals.delete(String(data.id));
        } else if (event.type === 'assistant/message') {
          const data = event.data || {};
          if (data.message) {
            const finalText = textOf(data.message.content);
            if (finalText.trim()) {
              answer = finalText;
              text = finalText;
            }
            const settled = reasoningBlocksOfMessage(data.message);
            if (settled.length) mergeSettledReasoning(reasoning, settled, data.turn, data.step);
          }
          answerSeq = seq;
        } else if (event.type === 'turn/end') {
          ended = true;
          tool = '';
          pendingQuestions.clear();
          pendingApprovals.clear();
        }
      }
      const awaiting = ended ? '' : (pendingQuestions.size ? 'question' : pendingApprovals.size ? 'approval' : '');
      return {
        text, answer, answerSeq, ended, cost, step, tool, startedAt, awaiting,
        ...reasoningFieldsOf(reasoning),
      };
    }

    // ----------------------------------------------------------------- layout
    /** Branches at this depth and deeper start folded, so a big tree opens readable. */
    const DEFAULT_COLLAPSE_DEPTH = 2;

    /** Statuses that mean the model is still working on this node. */
    const RUNNING_STATUSES = ['thinking', 'streaming', 'running'];

    /**
     * A node is active while it runs or while it is blocked on the user. The
     * two are separate signals: the host keeps the turn open and reports the
     * session as running while `ask_user_question` waits, so `awaiting` is the
     * only record that the wait is on the human.
     */
    function isInProgressNode(node) {
      if (!node) return false;
      return RUNNING_STATUSES.indexOf(node.status) >= 0
        || node.awaiting === 'question'
        || node.awaiting === 'approval';
    }

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
     *
     * `keepOpen` holds nodes that sit on the path to an active node. A folded
     * node is pruned out of the layout walk entirely, so the card below it has
     * no position and is never drawn — which is how a running branch used to
     * vanish behind a "⋯ N descendants" chip. The path to something in progress
     * is therefore never folded by default; a manual fold is still respected.
     */
    function effectiveCollapsedOf(nodes, collapsed, keepOpen) {
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
          result[node.id] = hasChildren
            && (depthOf.get(node.id) || 0) >= DEFAULT_COLLAPSE_DEPTH
            && !(keepOpen && keepOpen.has(node.id));
        }
      }
      return result;
    }

    /** Ancestors of every active node: the folds that must stay open to draw it. */
    function activeAncestorsOf(nodes, activeIds) {
      const byId = new Map(nodes.map((node) => [node.id, node]));
      const keep = new Set();
      for (const node of nodes) {
        if (!activeIds.has(node.id)) continue;
        let cursor = node.parentId === null || node.parentId === undefined ? undefined : byId.get(node.parentId);
        let guard = 0;
        while (cursor && guard < 500) {
          keep.add(cursor.id);
          cursor = cursor.parentId === null || cursor.parentId === undefined ? undefined : byId.get(cursor.parentId);
          guard += 1;
        }
      }
      return keep;
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

    function layoutTree(nodes, collapsed, heights, direction) {
      const childrenOf = childrenMapOf(nodes);
      const kids = (node) => (collapsed[node.id] ? [] : childrenOf.get(node.id) || []);
      const roots = childrenOf.get('@root') || [];
      const depthOf = depthMapOf(nodes);

      if (direction === 'horizontal') {
        const spans = new Map();
        const positions = new Map();
        const edges = [];
        const heightOf = (node) => heights[node.id] || NODE_H;
        function measure(node) {
          const list = kids(node);
          const childSpan = list.reduce((total, child, index) => total + measure(child) + (index ? GAP_X : 0), 0);
          const span = Math.max(heightOf(node), childSpan);
          spans.set(node.id, span);
          return span;
        }
        function place(node, top) {
          const list = kids(node);
          const ownHeight = heightOf(node);
          const span = spans.get(node.id);
          const childSpan = list.reduce((total, child, index) => total + spans.get(child.id) + (index ? GAP_X : 0), 0);
          let cursor = top + (span - childSpan) / 2;
          for (const child of list) {
            place(child, cursor);
            cursor += spans.get(child.id) + GAP_X;
          }
          let center = top + span / 2;
          if (list.length) {
            const first = list[0];
            const last = list[list.length - 1];
            center = (positions.get(first.id).y + heightOf(first) / 2 + positions.get(last.id).y + heightOf(last) / 2) / 2;
          }
          const y = Math.max(top, Math.min(top + span - ownHeight, center - ownHeight / 2));
          positions.set(node.id, { x: (depthOf.get(node.id) || 0) * (NODE_W + GAP_Y), y });
        }
        let top = 0;
        for (const root of roots) {
          measure(root);
          place(root, top);
          top += spans.get(root.id) + GAP_X * 2;
        }
        let maxX = 0;
        let maxY = 0;
        for (const node of nodes) {
          const pos = positions.get(node.id);
          if (!pos) continue;
          const height = heightOf(node);
          maxX = Math.max(maxX, pos.x + NODE_W);
          maxY = Math.max(maxY, pos.y + height);
          for (const child of kids(node)) {
            const childPos = positions.get(child.id);
            if (childPos) edges.push({
              id: node.id + '>' + child.id,
              x1: pos.x + NODE_W, y1: pos.y + height / 2,
              x2: childPos.x, y2: childPos.y + heightOf(child) / 2,
            });
          }
        }
        return { positions, edges, width: maxX, height: maxY, roots };
      }

      const widths = new Map();
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
        meta: { events: 0, binding: false, hasMore: false, openState: '' },
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
            // Reasoning is deliberately NOT persisted here.
            //
            // Two reasons. It is re-derived from the session log on every
            // projection, so a copy here only duplicates bytes. And it is the
            // one field that can reach tens of kilobytes per node, which is
            // exactly what would push this snapshot into the localStorage
            // quota — and this snapshot also holds the parent links, which
            // are the only thing here that *cannot* be rebuilt. Losing those
            // flattens the tree, so the large derivable field gives way.
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
              reasoning: turn.reasoning || '',
              reasoningDropped: turn.reasoningDropped || 0,
              status: turn.status,
              answerSeq: turn.answerSeq,
              kind: 'root',
              sourceKind: turn.kind || '',
              awaiting: turn.awaiting || '',
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
              (existing.reasoning || '') !== next.reasoning ||
              (existing.reasoningDropped || 0) !== next.reasoningDropped ||
              existing.answerSeq !== next.answerSeq ||
              existing.status !== next.status ||
              (existing.awaiting || '') !== next.awaiting ||
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
          // Only prune when the projection actually produced turns. A freshly
          // re-bound session starts with an empty window until its first page
          // lands; pruning there used to erase the whole tree.
          const wanted = new Set(ids);
          const before = state.nodes.length;
          if (!state.meta.hasMore && turns.length > 0) {
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
        /** Open the path to a node without touching selection (auto-follow). */
        expandPath(id) {
          const collapsed = { ...state.collapsed };
          let changed = false;
          for (const ancestor of pathOf(state.nodes, id)) {
            if (ancestor === id || collapsed[ancestor] === false) continue;
            collapsed[ancestor] = false;
            changed = true;
          }
          if (!changed) return;
          state.collapsed = collapsed;
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
          store.setError(T('error.sessionNotOpen'));
          store.setMeta({ binding: false, events: 0 });
          return;
        }
        const sessionSnapshot = () => {
          try {
            return binding.session && typeof binding.session.getSnapshot === 'function'
              ? binding.session.getSnapshot()
              : null;
          } catch (error) {
            return null;
          }
        };
        const read = () => {
          const window = binding.eventSource.getSnapshot();
          const session = sessionSnapshot();
          store.setMeta({
            binding: true,
            events: window.entries.length,
            hasMore: Boolean(window.hasMore),
            openState: session && session.openState ? session.openState : '',
          });
          store.ensureChain(projectTurns(window.entries, session ? session.running : undefined));
          return { window, session };
        };
        // A retired scope drops its Session instance, and the next
        // materialisation mints a new one with a new event source
        // (ClientSessions.materializeScope). Keeping the old unsubscribe would
        // leave this view frozen on the empty window it saw first.
        const known = rootSubscriptions.get(rootId);
        if (!known || known.source !== binding.eventSource) {
          if (known && typeof known.unsubscribe === 'function') {
            try { known.unsubscribe(); } catch (error) { /* the dropped source is already gone */ }
          }
          rootSubscriptions.set(rootId, {
            source: binding.eventSource,
            unsubscribe: binding.eventSource.subscribe(read),
          });
        }
        const first = read();
        if (store.getSnapshot().error) store.setError(null);
        // A cold window is not final: ask the session to open (idempotent) and
        // read again once its first page lands. A tab restored straight onto a
        // freshly materialised session would otherwise stay blank until
        // something else — the Chat view — filled the window first.
        if (first.window.entries.length === 0
          && first.session && first.session.openState !== 'open'
          && binding.session && typeof binding.session.open === 'function') {
          try {
            Promise.resolve(binding.session.open()).then(read).catch(() => undefined);
          } catch (error) {
            /* opening is best effort; the subscription still wakes us */
          }
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
          if (!binding) throw new Error(T('error.noBinding'));
          ensureProjection(rootId, store);
          projectBranches(rootId, store);
          return true;
        } catch (error) {
          store.setError(T('error.openFailed', { reason: String((error && error.message) || error) }));
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
          if ((read2.reasoning || '') !== (current.reasoning || '')) changes.reasoning = read2.reasoning || '';
          if ((read2.reasoningDropped || 0) !== (current.reasoningDropped || 0)) {
            changes.reasoningDropped = read2.reasoningDropped || 0;
          }
          const awaiting = read2.awaiting || '';
          if (awaiting !== (current.awaiting || '')) changes.awaiting = awaiting;
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
          } else if (read2.text || read2.answer || read2.tool || awaiting) {
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
          store.setError(T('error.forkFailed', { reason: String((error && error.message) || error) }));
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
        // The new card sits below its parent: open the path so it is drawn even
        // when the fork point was behind a folded branch.
        store.expandPath(nodeId);
        store.compose(null);
        store.select(nodeId);

        let reference;
        try {
          reference = ctx.sessions.retain(childId, { source: 'gateway' });
        } catch (error) {
          store.patch(nodeId, { status: 'error', answer: T('error.branchUnopenable', { reason: String((error && error.message) || error) }) });
          return;
        }

        let binding;
        try {
          binding = await reference.ready;
        } catch (error) {
          store.patch(nodeId, {
            status: 'error',
            answer: T('error.branchNoBinding', { reason: String((error && error.message) || error) }),
          });
          return;
        }
        if (!binding) {
          store.patch(nodeId, { status: 'error', answer: T('error.branchNoUsableBinding') });
          return;
        }
        const baseline = maxDurableSeq(binding.eventSource.getSnapshot().entries);
        let busy = false;

        // Name the fork after its branch so the session list stays readable.
        const branchTitle = '⟂ ' + (parentNode.question || T('reader.branch')).replace(/\s+/g, ' ').slice(0, 26)
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
            const awaiting = read.awaiting || '';
            const node = store.getNode(nodeId);
            if (node && awaiting !== (node.awaiting || '')) store.patch(nodeId, { awaiting });
            // The branch's reasoning arrives with the same events as its answer,
            // so it is patched in the same breath.
            if (node && ((read.reasoning || '') !== (node.reasoning || '')
              || (read.reasoningDropped || 0) !== (node.reasoningDropped || 0))) {
              store.patch(nodeId, {
                reasoning: read.reasoning || '',
                reasoningDropped: read.reasoningDropped || 0,
              });
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
            store.patch(nodeId, { status: 'error', answer: T('error.submitFailed', { reason: JSON.stringify(result.error) }) });
          }
        } catch (error) {
          store.patch(nodeId, { status: 'error', answer: T('error.submitFailed', { reason: String((error && error.message) || error) }) });
        }
      }
        async function loadOlder(rootId) {
        const binding = ctx.sessions.binding(rootId);
        if (!binding) return;
        try {
          await binding.session.loadOlder();
        } catch (error) {
          storeFor(rootId).setError(T('error.loadOlderFailed', { reason: String((error && error.message) || error) }));
        }
      }

      return { rootOf, storeFor, ensureProjection, ensureOpen, branch, loadOlder, deleteSubtree, restoreHidden };
    }

    // -------------------------------------------------------------- markdown
    const MD = {
      body: { fontSize: 12, lineHeight: 1.72, color: C.ink2, wordBreak: 'break-word' },
      h1: { fontSize: '1.3em', fontWeight: 700, color: C.ink, margin: '0.7em 0 0.3em', lineHeight: 1.35 },
      h2: { fontSize: '1.16em', fontWeight: 700, color: C.ink, margin: '0.65em 0 0.28em', lineHeight: 1.38 },
      h3: { fontSize: '1.06em', fontWeight: 600, color: C.ink, margin: '0.58em 0 0.24em', lineHeight: 1.4 },
      h4: { fontSize: '1.01em', fontWeight: 600, color: C.ink, margin: '0.52em 0 0.22em', lineHeight: 1.42 },
      h5: { fontSize: '0.98em', fontWeight: 600, color: C.ink3, margin: '0.48em 0 0.2em', lineHeight: 1.42 },
      h6: { fontSize: '0.96em', fontWeight: 600, color: C.ink3, margin: '0.44em 0 0.18em', lineHeight: 1.42 },
      p: { margin: '0 0 0.5em' },
      ul: { margin: '0 0 0.5em', paddingLeft: '1.4em' },
      ol: { margin: '0 0 0.5em', paddingLeft: '1.5em' },
      li: { margin: '0 0 0.16em' },
      checkbox: { marginRight: '0.4em', verticalAlign: 'middle' },
      quote: {
        margin: '0 0 0.5em', paddingLeft: '0.75em', borderLeft: '2px solid ' + C.line,
        color: C.ink3,
      },
      hr: { border: 'none', borderTop: '1px solid ' + C.line, margin: '0.75em 0' },
      codeBlock: {
        margin: 0, padding: '0.55em 0.75em', borderRadius: 6, background: C.code,
        border: '1px solid ' + C.line, fontFamily: MONO,
        fontSize: '0.9em', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowX: 'auto', color: C.ink,
      },
      codeLang: {
        margin: '0 0 0.3em', fontSize: '0.78em', letterSpacing: '0.04em',
        color: C.ink4, fontFamily: MONO, textTransform: 'uppercase',
      },
      inlineCode: {
        fontFamily: MONO, fontSize: '0.92em',
        background: C.codeInline, borderRadius: 3, padding: '0 0.28em', color: C.ink,
      },
      link: { color: C.accent, textDecoration: 'none' },
      image: {
        display: 'block', maxWidth: '100%', height: 'auto',
        margin: '0.4em 0', borderRadius: 6,
      },
      strong: { fontWeight: 700, color: C.ink },
    };

    /*
     * Why this is a renderer and not a Markdown library.
     *
     * The view has no dependencies and ships as one file the host loads, so it
     * cannot pull in a parser. What it can do is cover the subset an answer
     * actually uses and be explicit about the rest: reference links, footnotes
     * and raw HTML blocks are passed through as text rather than half-rendered.
     *
     * Raw HTML is never injected — every string here becomes a React text node,
     * so a model that writes a script tag gets the characters, not an element.
     * That is also why this is safe to run on model output.
     */

    /** Only these schemes may become a live link. */
    function safeHref(raw) {
      const url = String(raw || '').trim();
      if (!url) return null;
      if (/^(https?:|mailto:)/i.test(url)) return url;
      // Relative links and fragment anchors are fine. Anything else — notably
      // javascript: and data: — would turn model output into script execution.
      if (/^(\/|\.{1,2}\/|#)/.test(url)) return url;
      return null;
    }

    /** Strip the angle brackets or quotes a URL may be wrapped in. */
    function cleanUrl(raw) {
      return String(raw || '').trim().replace(/^<|>$/g, '').replace(/^["']|["']$/g, '');
    }

    /** Index of the closing `marker` at or after `from`, or -1 when unclosed. */
    function closeOf(text, from, marker) {
      let found = text.indexOf(marker, from);
      while (found >= 0) {
        if (text[found - 1] !== '\\') return found;
        found = text.indexOf(marker, found + marker.length);
      }
      return -1;
    }

    /**
     * Inline Markdown: escapes, code spans, emphasis, strikethrough, images,
     * links, autolinks and hard breaks.
     */
    function inlineNodes(text, keyBase) {
      const out = [];
      const source = String(text === undefined || text === null ? '' : text);
      let buffer = '';
      let index = 0;
      const nextKey = () => keyBase + '-' + (index++);
      const flush = () => { if (buffer) { out.push(buffer); buffer = ''; } };
      let i = 0;
      while (i < source.length) {
        const ch = source[i];
        // Backslash escape: the next character is literal.
        if (ch === '\\' && i + 1 < source.length && /[\\`*_{}[\]()#+\-.!>~|]/.test(source[i + 1])) {
          buffer += source[i + 1];
          i += 2;
          continue;
        }
        // A backslash at the end of a line is a hard break.
        if (ch === '\\' && source[i + 1] === '\n') {
          flush();
          out.push(h('br', { key: nextKey() }));
          i += 2;
          continue;
        }
        if (ch === '\n') {
          // Two trailing spaces are a hard break; any other newline is a space,
          // since a card is a narrow column where a stray newline reads as a
          // broken word.
          if (/  $/.test(buffer)) {
            buffer = buffer.replace(/ +$/, '');
            flush();
            out.push(h('br', { key: nextKey() }));
          } else {
            buffer += ' ';
          }
          i += 1;
          continue;
        }
        // Code span: a run of N backticks closed by the same run.
        if (ch === '`') {
          const run = /^`+/.exec(source.slice(i))[0];
          const close = source.indexOf(run, i + run.length);
          if (close > i) {
            flush();
            const inner = source.slice(i + run.length, close).replace(/^ | $/g, '');
            out.push(h('code', { key: nextKey(), style: MD.inlineCode }, inner));
            i = close + run.length;
            continue;
          }
        }
        // Image: ![alt](src "title")
        if (ch === '!' && source[i + 1] === '[') {
          const match = /^!\[([^\]]*)\]\(\s*((?:[^()\s]|\([^()]*\))+)(?:\s+"([^"]*)")?\s*\)/.exec(source.slice(i));
          if (match) {
            flush();
            const href = safeHref(cleanUrl(match[2]));
            if (href) {
              out.push(h('img', {
                key: nextKey(), src: href, alt: match[1] || '',
                title: match[3] || undefined, loading: 'lazy', style: MD.image,
              }));
            } else {
              out.push(match[1] || match[2]);
            }
            i += match[0].length;
            continue;
          }
        }
        // Link: [text](href "title")
        if (ch === '[') {
          const match = /^\[([^\]]*)\]\(\s*((?:[^()\s]|\([^()]*\))+)(?:\s+"([^"]*)")?\s*\)/.exec(source.slice(i));
          if (match) {
            flush();
            const href = safeHref(cleanUrl(match[2]));
            const label = match[1] || match[2];
            if (href) {
              out.push(h('a', {
                key: nextKey(), href, target: '_blank', rel: 'noreferrer noopener',
                title: match[3] || undefined, style: MD.link,
              }, inlineNodes(label, nextKey())));
            } else {
              out.push(label);
            }
            i += match[0].length;
            continue;
          }
        }
        // Autolink: <https://example.com>
        if (ch === '<') {
          const match = /^<((?:https?:|mailto:)[^>\s]+)>/.exec(source.slice(i));
          if (match) {
            flush();
            out.push(h('a', {
              key: nextKey(), href: match[1], target: '_blank',
              rel: 'noreferrer noopener', style: MD.link,
            }, match[1].replace(/^mailto:/, '')));
            i += match[0].length;
            continue;
          }
        }
        // A bare URL outside a link is still a link.
        if ((ch === 'h' || ch === 'H') && /^https?:\/\//i.test(source.slice(i, i + 8))) {
          const match = /^https?:\/\/[^\s<>()]+/i.exec(source.slice(i));
          if (match) {
            const url = match[0].replace(/[.,;:!?'"]+$/, '');
            flush();
            out.push(h('a', {
              key: nextKey(), href: url, target: '_blank',
              rel: 'noreferrer noopener', style: MD.link,
            }, url));
            i += url.length;
            continue;
          }
        }
        // Strikethrough, strong and emphasis. The inner text is parsed again so
        // that strong-wrapping-code and nested emphasis come out right.
        if (ch === '~' && source[i + 1] === '~') {
          const close = closeOf(source, i + 2, '~~');
          if (close > i) {
            flush();
            out.push(h('del', { key: nextKey() }, inlineNodes(source.slice(i + 2, close), nextKey())));
            i = close + 2;
            continue;
          }
        }
        if ((ch === '*' && source[i + 1] === '*') || (ch === '_' && source[i + 1] === '_')) {
          const marker = ch + ch;
          const close = closeOf(source, i + 2, marker);
          if (close > i) {
            flush();
            out.push(h('strong', { key: nextKey(), style: MD.strong },
              inlineNodes(source.slice(i + 2, close), nextKey())));
            i = close + 2;
            continue;
          }
        }
        if (ch === '*' || ch === '_') {
          const close = closeOf(source, i + 1, ch);
          if (close > i) {
            flush();
            out.push(h('em', { key: nextKey() }, inlineNodes(source.slice(i + 1, close), nextKey())));
            i = close + 1;
            continue;
          }
        }
        buffer += ch;
        i += 1;
      }
      flush();
      return out;
    }

    /** Leading indentation of a line, with tabs counted as four spaces. */
    function indentOf(line) {
      const lead = /^[ \t]*/.exec(line)[0];
      return lead.replace(/\t/g, '    ').length;
    }

    /**
     * Read one list block, including nesting.
     *
     * The walk is indentation-based: an item at the list's own indent starts a
     * new entry, and anything deeper belongs to the entry above and is rendered
     * as nested blocks — which is what makes a sub-bullet read as a child
     * instead of a second flat item, the single most common shape in an answer.
     */
    function parseListBlock(lines, start) {
      const ordered = /^\s*\d+[.)]\s+/.test(lines[start]);
      const baseIndent = indentOf(lines[start]);
      const itemRe = ordered ? /^(\s*)(\d+)[.)]\s+(.*)$/ : /^(\s*)[-*+]\s+(.*)$/;
      const items = [];
      let startNumber = 1;
      let i = start;
      while (i < lines.length) {
        const line = lines[i];
        if (/^\s*$/.test(line)) {
          // A blank line only ends the list when the next non-blank line is not
          // another item of this list.
          let j = i + 1;
          while (j < lines.length && /^\s*$/.test(lines[j])) j += 1;
          if (j < lines.length && indentOf(lines[j]) === baseIndent && itemRe.test(lines[j])) {
            i = j;
            continue;
          }
          break;
        }
        const match = itemRe.exec(line);
        const indent = indentOf(line);
        if (match && indent === baseIndent) {
          if (ordered && items.length === 0) startNumber = parseInt(match[2], 10) || 1;
          items.push({ text: ordered ? match[3] : match[2], rest: [] });
          i += 1;
          continue;
        }
        if (!items.length) break;
        if (indent > baseIndent) {
          items[items.length - 1].rest.push(line.slice(Math.min(indent, baseIndent + 2)));
          i += 1;
          continue;
        }
        break;
      }
      return { items, ordered, startNumber, next: i };
    }

    /** A fenced code block, with its info string kept as a visible label. */
    function renderCodeBlock(language, body, key) {
      const lang = String(language || '').trim().split(/\s+/)[0];
      const label = lang ? h('div', { style: MD.codeLang }, lang) : null;
      return h('div', { key, style: { margin: '0 0 0.6em' } },
        label,
        h('pre', { style: MD.codeBlock }, body.join('\n')));
    }

    /** Small block-level Markdown renderer. */
    function renderMarkdown(text) {
      const source = String(text || '').replace(/\r\n?/g, '\n');
      if (!source.trim()) return null;
      const lines = source.split('\n');
      const blocks = [];
      let i = 0;
      let blockKey = 0;

      while (i < lines.length) {
        const line = lines[i];
        if (/^\s*$/.test(line)) { i += 1; continue; }

        // Fenced code: three or more backticks or tildes, closed by at least as
        // many of the same character.
        const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
        if (fence) {
          const marker = fence[1];
          const closer = new RegExp('^\\s*' + (marker[0] === '`' ? '`' : '~') + '{' + marker.length + ',}\\s*$');
          const body = [];
          i += 1;
          while (i < lines.length && !closer.test(lines[i])) {
            body.push(lines[i]);
            i += 1;
          }
          i += 1;
          blocks.push(renderCodeBlock(fence[2], body, 'b' + blockKey));
          blockKey += 1;
          continue;
        }

        // Indented code block: four spaces. A list continuation never reaches
        // here, because the list branch above consumes it.
        if (/^ {4}\S/.test(line)) {
          const body = [];
          while (i < lines.length && (/^ {4}/.test(lines[i]) || /^\s*$/.test(lines[i]))) {
            body.push(lines[i].replace(/^ {4}/, ''));
            i += 1;
          }
          while (body.length && /^\s*$/.test(body[body.length - 1])) body.pop();
          blocks.push(renderCodeBlock('', body, 'b' + blockKey));
          blockKey += 1;
          continue;
        }

        // ATX heading -> a real heading element, so the reader has a document
        // structure and a screen reader announces it as one.
        const atx = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
        if (atx) {
          const level = atx[1].length;
          blocks.push(h('h' + level, { key: 'b' + blockKey, style: MD['h' + level] },
            inlineNodes(atx[2], 'h' + blockKey)));
          blockKey += 1;
          i += 1;
          continue;
        }

        // Setext heading: a text line underlined by === or ---.
        if (i + 1 < lines.length && /^\s*(=+|-{2,})\s*$/.test(lines[i + 1])
          && !/^\s*([-*+]|\d+[.)])\s+/.test(line) && !/^\s*\|/.test(line)) {
          const level = /^\s*=/.test(lines[i + 1]) ? 1 : 2;
          blocks.push(h('h' + level, { key: 'b' + blockKey, style: MD['h' + level] },
            inlineNodes(line.trim(), 'h' + blockKey)));
          blockKey += 1;
          i += 2;
          continue;
        }

        if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
          blocks.push(h('hr', { key: 'b' + blockKey, style: MD.hr }));
          blockKey += 1;
          i += 1;
          continue;
        }

        if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
          const parsed = parseListBlock(lines, i);
          i = parsed.next;
          const tag = parsed.ordered ? 'ol' : 'ul';
          blocks.push(h(tag, {
            key: 'b' + blockKey,
            style: parsed.ordered ? MD.ol : MD.ul,
            start: parsed.ordered && parsed.startNumber !== 1 ? parsed.startNumber : undefined,
          }, parsed.items.map((item, n) => {
            const task = /^\[([ xX])\]\s+/.exec(item.text);
            const content = task ? item.text.slice(task[0].length) : item.text;
            const children = [];
            if (task) {
              children.push(h('input', {
                key: 't' + n, type: 'checkbox', checked: task[1] !== ' ',
                disabled: true, readOnly: true, style: MD.checkbox,
              }));
            }
            children.push(...inlineNodes(content, 'b' + blockKey + '-' + n));
            if (item.rest.length) children.push(...(renderMarkdown(item.rest.join('\n')) || []));
            return h('li', { key: 'l' + n, style: MD.li }, children);
          })));
          blockKey += 1;
          continue;
        }

        // Block quote: recurse, so a list or a fence inside a quote renders.
        if (/^\s*>/.test(line)) {
          const quoted = [];
          while (i < lines.length && (/^\s*>/.test(lines[i]) || /^\s*$/.test(lines[i]))) {
            if (/^\s*$/.test(lines[i])) {
              const next = lines[i + 1];
              if (next === undefined || !/^\s*>/.test(next)) break;
              quoted.push('');
              i += 1;
              continue;
            }
            quoted.push(lines[i].replace(/^\s*>\s?/, ''));
            i += 1;
          }
          blocks.push(h('blockquote', { key: 'b' + blockKey, style: MD.quote },
            renderMarkdown(quoted.join('\n')) || null));
          blockKey += 1;
          continue;
        }

        // A GFM table: a pipe row whose next line is the delimiter row. The
        // delimiter is what separates a table from prose containing pipes.
        if (/\|/.test(line) && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
          const aligns = splitTableRow(lines[i + 1]).map((cell) => {
            const left = cell.startsWith(':');
            const right = cell.endsWith(':');
            return left && right ? 'center' : right ? 'right' : 'left';
          });
          const header = splitTableRow(line);
          i += 2;
          const rows = [];
          while (i < lines.length && /\|/.test(lines[i]) && !/^\s*$/.test(lines[i])) {
            rows.push(splitTableRow(lines[i]));
            i += 1;
          }
          const cellStyle = (index) => ({ textAlign: aligns[index] || 'left' });
          blocks.push(h('div', { key: 'b' + blockKey, className: 'dsh-tree-table-wrap' },
            h('table', { className: 'dsh-tree-table' },
              h('thead', null,
                h('tr', null, header.map((cell, index) => h('th', {
                  key: 'h' + index,
                  style: cellStyle(index),
                }, inlineNodes(cell, 'th' + blockKey + '-' + index))))),
              h('tbody', null, rows.map((row, rowIndex) => h('tr', { key: 'r' + rowIndex },
                row.map((cell, index) => h('td', {
                  key: 'c' + index,
                  style: cellStyle(index),
                }, inlineNodes(cell, 'td' + blockKey + '-' + rowIndex + '-' + index)))))))));
          blockKey += 1;
          continue;
        }

        // Paragraph: runs to the next block start.
        const paragraph = [];
        while (i < lines.length && !/^\s*$/.test(lines[i])
          && !/^\s*(`{3,}|~{3,})/.test(lines[i]) && !/^#{1,6}\s+/.test(lines[i])
          && !/^\s*[-*+]\s+/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i])
          && !/^\s*>/.test(lines[i]) && !/^ {4}\S/.test(lines[i])
          && !(/^\s*\|/.test(lines[i]) && i + 1 < lines.length && isTableDelimiter(lines[i + 1]))
          && !(i + 1 < lines.length && /^\s*(=+|-{2,})\s*$/.test(lines[i + 1]))) {
          paragraph.push(lines[i]);
          i += 1;
        }
        if (!paragraph.length) { i += 1; continue; }
        blocks.push(h('p', { key: 'b' + blockKey, style: MD.p },
          inlineNodes(paragraph.join('\n'), 'p' + blockKey)));
        blockKey += 1;
      }
      return blocks;
    }

    /** Whether a line is a GFM table delimiter row (`| --- | :---: |`). */
    function isTableDelimiter(line) {
      if (!line || line.indexOf('-') < 0) return false;
      const cells = splitTableRow(line);
      return cells.length > 0 && cells.every((cell) => /^:?-{1,}:?$/.test(cell));
    }

    /**
     * Split one table row into cells.
     *
     * The outer pipes are optional in GFM, and `\|` is a literal pipe inside a
     * cell, so it is swapped for a placeholder before splitting and restored
     * afterwards.
     */
    function splitTableRow(line) {
      const source = String(line).trim().replace(/^\|/, '').replace(/\|$/, '');
      const cells = [];
      let cell = '';
      for (let index = 0; index < source.length; index += 1) {
        const ch = source[index];
        if (ch === '\\' && source[index + 1] === '|') {
          cell += '\u0000';
          index += 1;
        } else if (ch === '|') {
          cells.push(cell.trim().replace(/\u0000/g, '|'));
          cell = '';
        } else {
          cell += ch;
        }
      }
      cells.push(cell.trim().replace(/\u0000/g, '|'));
      return cells;
    }

    function Chevron({ dir, size, color }) {
      const box = size || 10;
      const rotate = dir === 'down' ? 0 : dir === 'up' ? 180 : dir === 'right' ? -90 : 90;
      return h('svg', {
        width: box, height: box, viewBox: '0 0 16 16', 'aria-hidden': true,
        style: {
          display: 'block', flex: '0 0 auto', color: color || 'currentColor',
          transform: 'rotate(' + rotate + 'deg)',
        },
      }, h('path', {
        d: 'M3.5 6 L8 10.5 L12.5 6',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }));
    }

    // ------------------------------------------------------------- components
    const MOTION_EXIT_MS = 140;
    const MOTION_CAMERA_MS = 320;
    const reducedMotion = () => typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /** Keep closing content only for its exit; timers never control app state. */
    function Presence({ show, className, children, ...props }) {
      const [present, setPresent] = useState(show);
      useEffect(() => {
        if (show) { setPresent(true); return undefined; }
        if (reducedMotion()) { setPresent(false); return undefined; }
        const timer = window.setTimeout(() => setPresent(false), MOTION_EXIT_MS);
        return () => window.clearTimeout(timer);
      }, [show]);
      if (!show && !present) return null;
      return h('div', {
        ...props,
        className: 'dsh-tree-presence ' + (className || ''),
        'data-open': show ? 'true' : 'false',
        inert: !show ? true : undefined,
        'aria-hidden': !show ? true : undefined,
      }, children);
    }

    /** Animate the actual camera so culling, dots and minimap stay in sync. */
    function useCanvasView() {
      const [view, setView] = useState({ x: 40, y: 40, z: 1 });
      const current = useRef(view);
      const motion = useRef(null);
      const commit = useCallback((next) => {
        current.current = next;
        setView(next);
      }, []);
      const cancel = useCallback(() => {
        if (motion.current) window.cancelAnimationFrame(motion.current.frame);
        motion.current = null;
      }, []);
      const move = useCallback((target, animate) => {
        cancel();
        const from = current.current;
        const next = typeof target === 'function' ? target(from) : target;
        if (!animate || reducedMotion() || typeof window.requestAnimationFrame !== 'function') {
          commit(next);
          return;
        }
        const run = { frame: null, start: null, target: next };
        const step = (time) => {
          if (motion.current !== run) return;
          if (run.start === null) run.start = time;
          const progress = Math.min(1, (time - run.start) / MOTION_CAMERA_MS);
          const eased = 1 - Math.pow(1 - progress, 3);
          commit({
            x: from.x + (next.x - from.x) * eased,
            y: from.y + (next.y - from.y) * eased,
            z: from.z + (next.z - from.z) * eased,
          });
          if (progress < 1) run.frame = window.requestAnimationFrame(step);
          else motion.current = null;
        };
        motion.current = run;
        run.frame = window.requestAnimationFrame(step);
      }, [cancel, commit]);
      useEffect(() => {
        const media = typeof window.matchMedia === 'function'
          ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
        const onChange = () => {
          if (!media.matches || !motion.current) return;
          const target = motion.current.target;
          cancel();
          commit(target);
        };
        if (media && media.addEventListener) media.addEventListener('change', onChange);
        return () => {
          cancel();
          if (media && media.removeEventListener) media.removeEventListener('change', onChange);
        };
      }, [cancel, commit]);
      return [view, move, cancel];
    }

    function Badge({ label, tone }) {
      return h('span', {
        style: {
          fontSize: 10, letterSpacing: '0.06em', color: tone || C.ink3,
          textTransform: 'uppercase', fontVariantNumeric: 'tabular-nums',
        },
      }, label);
    }

    function StatusDot({ status, waiting }) {
      const color = status === 'done' ? C.ok : status === 'error' ? C.warn : C.accent;
      const pulse = waiting || status === 'thinking' || status === 'streaming' || status === 'running';
      return h('span', {
        style: {
          width: 6, height: 6, borderRadius: 3, background: color,
          boxShadow: pulse ? '0 0 0 3px ' + C.accentSoft : 'none',
          display: 'inline-block',
          animation: pulse ? 'dshTreePulse 1.4s ease-in-out infinite' : 'none',
        },
      });
    }

    /**
     * How long the turn has been open, in milliseconds of wall clock.
     *
     * This is deliberately not `cost.ms`: `turnCost` can only measure between
     * durable events, so during one long thinking step it stops moving and then
     * jumps by minutes when the step settles. An open turn has to be measured
     * against the clock, clamped at zero so a skewed clock cannot print "-3s".
     */
    function liveElapsedMs(node, now) {
      if (!node || !node.startedAt || !now) return 0;
      return Math.max(0, now - node.startedAt);
    }

    /** Re-render the caller once a second while `active`. */
    function useTicker(active) {
      const [, setTick] = useState(0);
      useEffect(() => {
        if (!active) return undefined;
        const timer = setInterval(() => setTick((n) => n + 1), 1000);
        return () => clearInterval(timer);
      }, [active]);
      return Date.now();
    }

    /** What the model is doing right now: thinking, calling a tool, or writing. */
    function LiveProgress({ node, now }) {
      useLocale();
      const awaiting = node.awaiting === 'question' || node.awaiting === 'approval';
      const running = awaiting || node.status === 'thinking' || node.status === 'streaming' || node.status === 'running';
      if (!running) return null;
      const tool = node.tool || '';
      const step = node.step || 0;
      // The clock lives in the card (one timer for the whole card); this row
      // only reads it, so the live row and the header can never disagree.
      const elapsed = Math.round(liveElapsedMs(node, now) / 1000);
      // A pending question/approval is not "calling the tool": name the wait so
      // the card says the ball is in the user's court.
      const label = awaiting
        ? T(node.awaiting === 'approval' ? 'live.awaitingApproval' : 'live.awaiting')
        : tool
          ? T('live.calling', { tool })
          : node.answer
            ? T('live.outputting')
            : step > 0 ? T('live.thinking') : T('live.starting');
      return h('div', {
        style: {
          marginTop: 7, padding: '6px 8px', borderRadius: 7,
          background: C.accentSoft, border: '1px solid ' + C.accentEdge,
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
        step > 0 ? h('span', { style: { fontVariantNumeric: 'tabular-nums', opacity: 0.75 } }, T('live.step', { step })) : null,
        elapsed > 0 ? h('span', { style: { fontVariantNumeric: 'tabular-nums', opacity: 0.6 } }, elapsed + 's') : null);
    }

    /**
     * The agent's current thought, in one line.
     *
     * An elapsed time says the agent is busy; it does not say what it is
     * doing. This row carries the newest reasoning the model has written, so
     * the reader can tell a search from a refactor without opening anything.
     * Clicking it opens the reader, where the whole chain is readable while the
     * answer is still streaming.
     */
    function ReasoningTail({ node, onOpen }) {
      useLocale();
      const awaiting = node.awaiting === 'question' || node.awaiting === 'approval';
      const running = awaiting || node.status === 'thinking' || node.status === 'streaming' || node.status === 'running';
      const text = node.reasoning || '';
      if (!running || !text.trim()) return null;
      const preview = reasoningTail(text);
      if (!preview) return null;
      return h('button', {
        onClick: (event) => {
          event.stopPropagation();
          onOpen();
        },
        title: T('card.thinkExpandTitle'),
        className: 'dsh-tree-reasoning-tail dsh-tree-clamp-2',
        style: {
          display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
          fontFamily: 'inherit',
          marginTop: 5, padding: '4px 7px', borderRadius: 6,
          border: 'none', borderLeft: '2px solid ' + C.accentEdge,
          background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent)',
          fontSize: 10.5, color: C.ink4, lineHeight: 1.45,
        },
      }, preview);
    }

    /**
     * The card's reasoning row.
     *
     * It is a pointer, not a panel. Expanding the thinking inside a 320px card
     * stretched the card into a very long strip, which is exactly what made it
     * awkward to use; the reader is where a long answer — and the thinking
     * behind it — is actually read. So the row says how much there is and opens
     * the reader, where the chain sits at the top and folds away.
     */
    function ReasoningRow({ node, onOpen }) {
      useLocale();
      const text = node.reasoning || '';
      if (!text.trim()) return null;
      const preview = reasoningPreview(text);
      const dropped = node.reasoningDropped || 0;
      return h('div', {
        className: 'dsh-tree-reasoning',
        style: { marginTop: 6 },
      },
        h('button', {
          onClick: (event) => {
            event.stopPropagation();
            onOpen();
          },
          title: T('card.thinkExpandTitle'),
          className: LINK,
          style: { color: C.accent, gap: 5, maxWidth: '100%' },
        },
          h(Chevron, { dir: 'right', size: 9 }),
          h('span', { style: { flex: '0 0 auto' } }, T('card.think')),
          h('span', { style: { color: C.ink4, fontVariantNumeric: 'tabular-nums', flex: '0 0 auto' } },
            T('card.thinkMeta', { count: text.length }))),
        // The truncation notice is metadata, not part of the reasoning, so the
        // collapsed row can still say the text is partial.
        dropped > 0
          ? h('div', {
            style: {
              marginTop: 3, paddingLeft: 13, fontSize: 10.2,
              color: C.ink4, fontVariantNumeric: 'tabular-nums',
            },
          }, T('card.thinkTruncated', { count: dropped }))
          : null,
        preview
          ? h('div', {
            className: 'dsh-tree-reasoning-preview dsh-tree-clamp-2',
            style: {
              marginTop: 4, paddingLeft: 13, fontSize: 10.8, lineHeight: 1.5,
              color: C.ink4,
            },
          }, preview)
          : null);
    }

    /**
     * The reader's reasoning block: first thing in the answer, folded away.
     *
     * It lives in the reader's own scroll container rather than a nested one:
     * a second scroll area inside the reader is what made the wheel ambiguous,
     * and a long chain is easier to read in the flow than in a 260px box.
     */
    function ReasoningDisclosure({ node }) {
      useLocale();
      const [open, setOpen] = useState(false);
      const text = node.reasoning || '';
      if (!text.trim()) return null;
      const dropped = node.reasoningDropped || 0;
      return h('div', {
        className: 'dsh-tree-reasoning',
        style: { marginBottom: 18 },
      },
        h('button', {
          onClick: () => setOpen((value) => !value),
          'aria-expanded': open,
          title: open ? T('card.thinkCollapseTitle') : T('card.thinkExpandTitle'),
          className: LINK,
          style: { color: C.accent, gap: 5 },
        },
          h(Chevron, { dir: open ? 'down' : 'right', size: 9 }),
          h('span', null, T('card.think')),
          h('span', { style: { color: C.ink4, fontVariantNumeric: 'tabular-nums' } },
            T('card.thinkMeta', { count: text.length }))),
        dropped > 0
          ? h('div', {
            style: {
              marginTop: 4, paddingLeft: 13, fontSize: 10.8,
              color: C.ink4, fontVariantNumeric: 'tabular-nums',
            },
          }, T('card.thinkTruncated', { count: dropped }))
          : null,
        open
          ? h('div', {
            style: {
              marginTop: 8, padding: '10px 13px', borderRadius: 9,
              border: '1px solid ' + C.cardEdge,
              background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent)',
              fontSize: 12.4, lineHeight: 1.78, color: C.ink4,
            },
          }, renderMarkdown(text))
          : null);
    }

    function NodeCard({ node, selected, dimmed, index, store, api, rootId, match, collapsed, childCount, descendants, isLatest, entering }) {
      useLocale();
      const snapshot = store.getSnapshot();
      const composing = snapshot.composingId === node.id;
      const [expanded, setExpanded] = useState(false);
      const [menuOpen, setMenuOpen] = useState(false);
      const cardRef = useRef(null);
      // Freeze this mount's entry decision; streamed tokens do not restart it.
      const animateEntry = useRef(entering);
      const isRunning = isInProgressNode(node);
      const awaiting = node.awaiting === 'question' || node.awaiting === 'approval';
      // A running card has a clock. Without it the elapsed time only moved when
      // a durable event landed, so a long thinking step left the number frozen
      // for minutes and then jumped — the label looked broken rather than busy.
      const now = useTicker(isRunning && Boolean(node.startedAt));
      const answer = node.answer || '';
      const answerText = answer.length > 1400 ? answer.slice(0, 1400) + T('card.truncated') : answer;

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
          ok = window.confirm(T('card.deleteConfirm'));
        } catch (error) {
          ok = true;
        }
        if (ok) api.deleteSubtree(rootId, node.id);
      };

      const statusLabel = awaiting
        ? T(node.awaiting === 'approval' ? 'card.status.awaitingApproval' : 'card.status.awaiting')
        : node.status === 'thinking' ? T('card.status.thinking')
          : node.status === 'streaming' || node.status === 'running' ? T('card.status.streaming')
            : node.status === 'error' ? T('card.status.error')
              : node.status === 'stopped' ? T('card.status.stopped')
                : T('card.status.done');

      return h('div', {
        ref: cardRef,
        className: 'dsh-tree-card' + (animateEntry.current ? ' dsh-tree-card--enter' : ''),
        onMouseDown: (event) => event.stopPropagation(),
        onClick: () => store.select(node.id),
        style: {
          position: 'absolute',
          left: 0,
          top: 0,
          width: NODE_W,
          minHeight: 132,
          background: C.card,
          border: '1px solid ' + (awaiting || match || selected ? C.accent : C.cardEdge),
          borderLeft: '3px solid ' + (selected || isRunning ? C.accent : dimmed ? C.cardEdge : C.line),
          borderRadius: 10,
          boxShadow: awaiting || selected
            ? '0 0 0 4px ' + C.accentSoft + ', var(--dsh-tree-shadow-2)'
            : match
              ? '0 0 0 3px ' + C.accentSoft + ', var(--dsh-tree-shadow-1)'
              : 'var(--dsh-tree-shadow-1)',
          padding: '10px 12px 9px',
          opacity: dimmed ? 0.72 : 1,
          boxSizing: 'border-box',
          cursor: 'pointer',
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, minHeight: 20 } },
          h(StatusDot, { status: node.status, waiting: awaiting }),
          h(Badge, { label: index, tone: C.accent }),
          isLatest
            ? h('span', {
              title: T('card.latestTitle'),
              style: {
                fontSize: 9.5, letterSpacing: '0.04em', color: C.accent, background: C.accentSoft,
                borderRadius: 999, padding: '0 6px', lineHeight: '15px', whiteSpace: 'nowrap',
              },
            }, T('card.latestBadge'))
            : null,
          h(Badge, { label: statusLabel }),
          // While the turn is open the header clock is wall clock, not the span
          // between the first and last durable event: the latter is what
          // `turnCost` can know from the log, and it stops moving the moment the
          // model thinks for a while without emitting anything durable.
          (function () {
            const live = isRunning && node.startedAt && now
              ? {
                ms: liveElapsedMs(node, now),
                tokens: node.cost ? node.cost.tokens : 0,
                cached: node.cost ? node.cost.cached : 0,
              }
              : node.cost;
            if (!live || !(live.ms || live.tokens)) return null;
            return h('span', {
            title: [
              live.ms ? T('card.cost.elapsed', { value: formatCost({ ms: live.ms, tokens: 0 }) }) : '',
              live.tokens ? T('card.cost.context', { value: formatCost({ ms: 0, tokens: live.tokens }) }) : '',
              live.cached ? T('card.cost.cached', { value: formatCost({ ms: 0, tokens: live.cached }) }) : '',
            ].filter(Boolean).join(' · '),
            style: {
              fontSize: 10.5, color: C.ink3, fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap', letterSpacing: '0.02em',
            },
          }, formatCost(live));
          })(),
          h('span', { style: { flex: 1 } }),
          isRunning
            ? h('button', {
              onClick: (event) => {
                event.stopPropagation();
                store.stop(node.id);
              },
              title: T('card.stopTitle'),
              className: BTN + ' dsh-tree-btn--sm dsh-tree-btn--danger',
            }, T('card.stop'))
            : null,
          node.status === 'done' && node.answerSeq
            ? h('button', {
              onClick: (event) => {
                event.stopPropagation();
                if (composing) store.cancelCompose();
                else store.compose(node.id);
              },
              title: composing ? T('composer.cancel') : T('card.ask'),
              'aria-label': composing ? T('composer.cancel') : T('card.ask'),
              'aria-expanded': composing,
              className: 'dsh-tree-btn dsh-tree-btn--icon dsh-tree-btn--sm dsh-tree-ask',
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
                title: T('card.more'),
                'aria-label': T('card.more'),
                'aria-expanded': menuOpen,
                className: 'dsh-tree-btn dsh-tree-btn--icon dsh-tree-btn--sm',
              }, h(Icon, { name: 'more' })),
              h(Presence, {
                  show: menuOpen,
                  className: 'dsh-tree-menu',
                  onKeyDown: (event) => {
                    if (event.key === 'Escape') {
                      event.stopPropagation();
                      setMenuOpen(false);
                      event.currentTarget.previousElementSibling.focus();
                    }
                  },
                  onMouseDown: (event) => event.stopPropagation(),
                  onClick: (event) => event.stopPropagation(),
                  style: {
                    position: 'absolute', top: 28, right: 0, zIndex: 5, background: C.overlay,
                    border: '1px solid ' + C.cardEdge, borderRadius: 9, padding: 4,
                    boxShadow: 'var(--dsh-tree-shadow-2)', minWidth: 132,
                  },
                }, h('button', {
                  onClick: () => {
                    setMenuOpen(false);
                    requestDelete();
                  },
                  title: T('card.deleteTitle'),
                  className: 'dsh-tree-btn dsh-tree-btn--sm dsh-tree-btn--danger',
                  style: { border: 'none', background: 'transparent', width: '100%', justifyContent: 'flex-start' },
                }, T('card.delete'))))
            : null),
        h('div', {
          className: 'dsh-tree-clamp-3',
          style: {
            fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, color: C.ink,
          },
        }, node.question || T('card.noQuestion')),
        h('div', {
          onClick: (event) => {
            if (!answer) return;
            event.stopPropagation();
            store.openReader(node.id);
          },
          title: answer ? T('card.readTitle') : undefined,
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
        h(LiveProgress, { node, now }),
        h(ReasoningTail, { node, onOpen: () => store.openReader(node.id) }),
        h(ReasoningRow, { node, onOpen: () => store.openReader(node.id) }),
        h(Presence, { show: composing, className: 'dsh-tree-composer' },
          h(Composer, { store, api, rootId, node, active: composing })),
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
                title: expanded ? T('card.collapseTitle') : T('card.expandTitle'),
                className: LINK,
                style: { color: C.accent },
              },
                expanded ? T('card.collapse') : T('card.expand'),
                h(Chevron, { dir: expanded ? 'up' : 'down', size: 9 }))
              : null,
            answer
              ? h('button', {
                onClick: (event) => {
                  event.stopPropagation();
                  store.openReader(node.id);
                },
                title: T('card.fullscreenTitle'),
                className: LINK,
                style: { cursor: 'zoom-in' },
              }, T('card.fullscreen'),
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
                title: collapsed ? T('card.unfoldBranch') : T('card.foldBranch'),
                className: collapsed ? CHIP : LINK,
              },
                h(Chevron, { dir: collapsed ? 'right' : 'down', size: 9 }),
                T(collapsed ? 'card.unfoldDescendants' : 'card.foldDescendants', { count: descendants || childCount }))
              : null)
          : null);
    }

    function Composer({ store, api, rootId, node, active }) {
      useLocale();
      const [value, setValue] = useState('');
      const ref = useRef(null);
      useEffect(() => {
        if (active && ref.current) ref.current.focus();
        if (!active) setValue('');
      }, [active]);

      const send = () => {
        const question = value.trim();
        if (!question || store.getSnapshot().composingId !== node.id) return;
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
          placeholder: T('composer.placeholder'),
          'aria-label': T('composer.label'),
          rows: 2,
          className: 'dsh-tree-textarea',
          style: {
            width: '100%', boxSizing: 'border-box', resize: 'none', fontFamily: FONT,
            fontSize: 12.5, lineHeight: 1.6, padding: '8px 10px', borderRadius: 8,
            border: '1px solid ' + C.cardEdge, outline: 'none', color: C.ink, background: C.card,
          },
        }),
        h('div', { style: { display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' } },
          h('span', { className: 'dsh-tree-one-line', style: { fontSize: 10.5, color: C.ink3 } },
            T('composer.from', { question: (node.question || '').slice(0, 12) })),
          h('span', { style: { flex: 1 } }),
          h('button', {
            onClick: () => store.cancelCompose(),
            className: BTN + ' dsh-tree-btn--sm',
          }, T('composer.cancel')),
          h('button', {
            onClick: send,
            className: BTN + ' dsh-tree-btn--sm dsh-tree-btn--primary',
          }, T('composer.send'))));
    }

    function Canvas({ store, api, rootId, size, ready }) {
      useLocale();
      const snapshot = store.getSnapshot();
      const nodes = snapshot.nodes;
      const [view, setView, cancelViewMotion] = useCanvasView();
      // All known nodes count as seen, including those outside the viewport.
      const seenNodes = useRef(new Set(nodes.map((node) => node.id)));
      useEffect(() => {
        for (const node of nodes) seenNodes.current.add(node.id);
      }, [nodes]);
      const [query, setQuery] = useState('');
      const [direction, setDirection] = useState(readLayoutDirection);
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
      const activeIds = useMemo(() => {
        const set = new Set();
        for (const node of liveNodes) if (isInProgressNode(node)) set.add(node.id);
        return set;
      }, [liveNodes]);
      // `defaultCollapsedMap` is the raw depth rule, `collapsedMap` is what is
      // actually laid out: the path to an active node stays open.
      const defaultCollapsedMap = useMemo(
        () => effectiveCollapsedOf(liveNodes, snapshot.collapsed),
        [liveNodes, snapshot.collapsed]);
      const collapsedMap = useMemo(
        () => effectiveCollapsedOf(liveNodes, snapshot.collapsed, activeAncestorsOf(liveNodes, activeIds)),
        [liveNodes, snapshot.collapsed, activeIds]);
      const counts = useMemo(() => {
        const childrenOf = childrenMapOf(liveNodes);
        const direct = new Map();
        for (const [key, list] of childrenOf) direct.set(key, list.length);
        return { direct, descendants: descendantCountsOf(liveNodes, childrenOf) };
      }, [liveNodes]);
      const layout = useMemo(
        () => layoutTree(liveNodes, collapsedMap, snapshot.heights, direction),
        [liveNodes, collapsedMap, snapshot.heights, direction]);
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
      const running = liveNodes.filter((node) => RUNNING_STATUSES.indexOf(node.status) >= 0).length;
      const waiting = liveNodes.filter((node) => node.awaiting === 'question' || node.awaiting === 'approval').length;
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
        const top = size.top + (toolbarRef.current ? toolbarRef.current.offsetHeight : 44) + 28;
        const availableHeight = Math.max(1, rect.height - top - size.bottom);
        const height = snapshot.heights[pendingFocus] || NODE_H;
        const z = Math.max(0.2, Math.min(1, (rect.width - 48) / NODE_W, (availableHeight - 32) / height));
        setView({ z, x: rect.width / 2 - (pos.x + NODE_W / 2) * z,
          y: top + availableHeight / 2 - (pos.y + height / 2) * z }, true);
        setPendingFocus(null);
      }, [pendingFocus, layout, snapshot.heights, size.top, size.bottom]);
      const latest = latestNodeOf(liveNodes);

      /** Jump to the next card matching `predicate`, wrapping around. */
      const focusNext = useCallback((predicate) => {
        const ids = liveNodes.filter(predicate).map((node) => node.id);
        if (!ids.length) return;
        const currentIndex = ids.indexOf(snapshot.selectedId);
        focusNode(ids[currentIndex < 0 ? 0 : (currentIndex + 1) % ids.length]);
      }, [liveNodes, snapshot.selectedId, focusNode]);

      // The in-progress card must never be reachable only by unfolding by hand.
      // Opening the path is enough for a running branch; the first branch that
      // starts waiting on the user is also brought into view, because that is
      // the one card the user has to act on.
      const openedRef = useRef(new Set());
      const announcedRef = useRef(new Set());
      // A different tree means a different id space; start the follow state over.
      useEffect(() => {
        openedRef.current = new Set();
        announcedRef.current = new Set();
      }, [store]);
      useEffect(() => {
        for (const node of liveNodes) {
          if (!isInProgressNode(node)) {
            openedRef.current.delete(node.id);
            announcedRef.current.delete(node.id);
            continue;
          }
          if (!openedRef.current.has(node.id)) {
            openedRef.current.add(node.id);
            const ancestors = [...pathOf(liveNodes, node.id)].filter((id) => id !== node.id);
            if (ancestors.some((id) => defaultCollapsedMap[id] === true)) store.expandPath(node.id);
          }
          const waitingNode = node.awaiting === 'question' || node.awaiting === 'approval';
          if (!waitingNode) {
            announcedRef.current.delete(node.id);
            continue;
          }
          if (announcedRef.current.has(node.id)) continue;
          const firstWait = announcedRef.current.size === 0;
          announcedRef.current.add(node.id);
          // Never yank the canvas out from under the reader overlay, and do not
          // steal the viewport when another branch is already waiting.
          if (firstWait && !store.getSnapshot().readingId) focusNode(node.id);
        }
      }, [liveNodes, defaultCollapsedMap, store, focusNode]);

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

      /**
       * Whether a wheel event belongs to something that scrolls on its own.
       *
       * The canvas claims every wheel event to zoom, so without this guard a
       * reader scrolling the expanded reasoning text (or the composer) zoomed
       * the whole canvas instead of scrolling the box under the pointer.
       *
       * `overflow-y` comes from the computed style rather than from our own
       * class names, so a native scrollable — the composer's textarea — is
       * covered by the same rule. The result distinguishes the two cases that
       * need different handling:
       *
       *   'scroll' — the box can move further in this direction, so the browser
       *              must handle the event natively and the canvas must stay out
       *              of it entirely;
       *   'edge'   — the box is already at that end. The wheel must do nothing
       *              at all: falling through to the zoom is what made the canvas
       *              jump under a reader who had simply reached the bottom.
       */
      function wheelOwner(target, stopAt, deltaY) {
        if (!target || !stopAt || typeof window === 'undefined') return false;
        for (let el = target; el && el !== stopAt; el = el.parentElement) {
          const style = window.getComputedStyle(el);
          const overflowY = style && style.overflowY;
          if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
          const range = el.scrollHeight - el.clientHeight;
          if (range <= 1) continue;
          const atTop = el.scrollTop <= 0;
          const atBottom = el.scrollTop >= range - 1;
          return deltaY < 0 ? (atTop ? 'edge' : 'scroll') : (atBottom ? 'edge' : 'scroll');
        }
        return false;
      }

      const onWheel = (event) => {
        const owned = wheelOwner(event.target, wrapRef.current, event.deltaY);
        if (owned === 'scroll') return;
        event.preventDefault();
        if (owned === 'edge') return;
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
        cancelViewMotion();
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
      const chromeHeight = () => size.top + (toolbarRef.current ? toolbarRef.current.offsetHeight : 48) + 22;

      const fit = () => {
        const rect = wrapRef.current ? wrapRef.current.getBoundingClientRect() : { width: 900, height: 600 };
        if (!layout.width || !layout.height) return;
        const chrome = chromeHeight();
        const availableW = Math.max(200, rect.width - 80);
        const availableH = Math.max(200, rect.height - chrome - size.bottom - 48);
        const z = Math.min(1, Math.min(availableW / layout.width, availableH / layout.height));
        const scale = Math.max(0.2, z);
        setView({
          z: scale,
          x: (rect.width - layout.width * scale) / 2,
          y: chrome,
        }, true);
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
        }, true);
      };

      const previousDirection = useRef(direction);
      useEffect(() => {
        if (previousDirection.current === direction) return;
        previousDirection.current = direction;
        if (snapshot.selectedId && layout.positions.has(snapshot.selectedId)) setPendingFocus(snapshot.selectedId);
        else fit();
      }, [direction]);

      const fittedRef = useRef(false);
      useEffect(() => {
        if (fittedRef.current || !ready || !liveNodes.length || !size.w) return;
        fittedRef.current = true;
        const rect = wrapRef.current ? wrapRef.current.getBoundingClientRect() : { width: 900, height: 600 };
        const chrome = chromeHeight();
        const availableW = Math.max(200, rect.width - 96);
        const availableH = Math.max(200, rect.height - chrome - size.bottom - 56);
        const raw = Math.min(1, availableW / Math.max(1, layout.width), availableH / Math.max(1, layout.height));
        const scale = Math.max(0.62, raw);
        setView({
          z: scale,
          x: Math.max(28, (rect.width - layout.width * scale) / 2),
          y: chrome,
        });
      }, [liveNodes.length, size.w, ready]);

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
        inert: snapshot.readingId ? true : undefined,
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
                d: direction === 'horizontal'
                  ? 'M' + edge.x1 + ' ' + edge.y1 + ' C' + (edge.x1 + 40) + ' ' + edge.y1 + ', ' + (edge.x2 - 40) + ' ' + edge.y2 + ', ' + edge.x2 + ' ' + edge.y2
                  : 'M' + edge.x1 + ' ' + edge.y1 + ' C' + edge.x1 + ' ' + (edge.y1 + 40) + ', ' + edge.x2 + ' ' + (edge.y2 - 40) + ', ' + edge.x2 + ' ' + edge.y2,
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
              entering: !seenNodes.current.has(node.id),
            }));
          })),

        // toolbar
        h('div', {
          ref: toolbarRef,
          onMouseDown: (event) => event.stopPropagation(),
          onWheel: (event) => event.stopPropagation(),
          style: {
            position: 'absolute', top: size.top + 10, left: 12, right: 12, display: 'flex', gap: 8,
            flexWrap: 'wrap', padding: 8, borderRadius: 12, background: C.card,
            border: '1px solid ' + C.cardEdge, boxShadow: 'var(--dsh-tree-shadow-1)',
            alignItems: 'center', fontSize: 12, color: C.ink3,
          },
        },
          h('span', { style: { fontWeight: 600, color: C.ink, fontSize: 12 } }, T('view.heading')),
          h('span', null, '· ' + T('view.nodes', { count: liveNodes.length })),
          running > 0
            ? h('button', {
              onClick: () => focusNext(isInProgressNode),
              title: T('view.runningTitle'),
              ...pillProps(),
            }, T('view.running', { count: running }))
            : null,
          waiting > 0
            ? h('button', {
              onClick: () => focusNext((node) => Boolean(node.awaiting)),
              title: T('view.awaitingTitle'),
              ...pillProps({ animation: 'dshTreePulse 2.4s ease-in-out infinite' }),
            }, T('view.awaiting', { count: waiting }))
            : null,
          snapshot.error ? h('span', { style: { color: C.warn } }, '· ' + snapshot.error) : null,
          snapshot.meta.hasMore
            ? h('button', { onClick: () => api.loadOlder(rootId), ...btnProps() }, T('view.loadOlder'))
            : null,
          tombstoned > 0
            ? h('button', {
              onClick: () => api.restoreHidden(rootId),
              title: T('view.restoreHiddenTitle'),
              ...pillProps(),
            }, T('view.restoreHidden', { count: Math.max(hiddenCount, tombstoned) }))
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
              placeholder: T('view.searchPlaceholder'),
              'aria-label': T('view.searchLabel'),
              style: {
                border: 'none', outline: 'none', fontSize: 12, width: 92, padding: '5px 0',
                fontFamily: FONT, color: C.ink, background: 'transparent',
              },
            }),
            matches && matches.size > 0
              ? h('span', { style: { fontSize: 11, color: C.accent, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } }, String(matches.size))
              : null),
          h('div', { role: 'group', 'aria-label': T('view.zoomGroup'), style: { display: 'flex', alignItems: 'center', gap: 4 } },
            h('button', {
              title: T('view.zoomOut'), 'aria-label': T('view.zoomOut'), disabled: view.z <= 0.21,
              onClick: () => zoomBy(1 / 1.15),
              className: BTN_ICON,
            }, h(Icon, { name: 'minus' })),
            h('span', {
              title: T('view.zoomLevel'),
              style: { minWidth: 44, textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: C.ink2, fontSize: 11.5 },
            }, Math.round(view.z * 100) + '%'),
            h('button', {
              title: T('view.zoomIn'), 'aria-label': T('view.zoomIn'), disabled: view.z >= 1.99,
              onClick: () => zoomBy(1.15),
              className: BTN_ICON,
            }, h(Icon, { name: 'plus' }))),
          // Both directions are visible at once, so the current one is a pressed
          // state rather than something the reader has to infer from the shape of
          // the canvas. A single toggle whose label never changes cannot say
          // which way the tree is running.
          h('div', {
            role: 'group',
            'aria-label': T('view.layoutGroup'),
            title: T('view.layoutTitle'),
            style: {
              display: 'flex', alignItems: 'center', gap: 2, padding: 2,
              border: '1px solid ' + C.cardEdge, borderRadius: 9, background: C.canvas,
            },
          },
            h('button', {
              className: BTN_SEGMENT,
              title: T('view.layoutVertical'),
              'aria-label': T('view.layoutVertical'),
              'aria-pressed': direction === 'vertical',
              onClick: () => {
                if (direction === 'vertical') return;
                saveLayoutDirection('vertical');
                setDirection('vertical');
              },
            }, h(Icon, { name: 'layoutVertical' })),
            h('button', {
              className: BTN_SEGMENT,
              title: T('view.layoutHorizontal'),
              'aria-label': T('view.layoutHorizontal'),
              'aria-pressed': direction === 'horizontal',
              onClick: () => {
                if (direction === 'horizontal') return;
                saveLayoutDirection('horizontal');
                setDirection('horizontal');
              },
            }, h(Icon, { name: 'layoutHorizontal' }))),
          h('button', { onClick: fit, className: BTN, title: T('view.fitTitle') }, h(Icon, { name: 'fit' }), T('view.fit')),
          h('button', {
            disabled: !latest,
            onClick: () => { if (!latest) return; setQuery(''); focusNode(latest.id); },
            title: latest ? T('view.latestTitle') : T('view.latestTitleEmpty'),
            className: BTN_PRIMARY,
          }, h(Icon, { name: 'latest' }), T('view.latest'))),

        // minimap
        layout.width > 0
          ? h('div', {
            onMouseDown: (event) => event.stopPropagation(),
            style: {
              position: 'absolute', right: 12, bottom: 12 + Math.min(size.bottom, Math.max(0, size.h - size.top - 160)), width: 168, height: 112,
              border: '1px solid ' + C.cardEdge, borderRadius: 8, background: C.card,
              boxShadow: 'var(--dsh-tree-shadow-1)', overflow: 'hidden', cursor: 'pointer',
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
              }), true);
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
                  // A node waiting on the user is a filled dot on the minimap too,
                  // so a blocked branch can be spotted without hunting for it.
                  const waiting = node.awaiting === 'question' || node.awaiting === 'approval';
                  return h('rect', {
                    key: node.id,
                    x: pos.x, y: pos.y, width: NODE_W,
                    height: snapshot.heights[node.id] || NODE_H,
                    rx: 10,
                    fill: matches && matches.has(node.id) ? C.accent : waiting ? C.accent : active ? C.accentSoft : C.line,
                    stroke: active ? C.accent : 'transparent',
                    strokeWidth: 1 / minimap.scale,
                  });
                }),
                h('rect', {
                  x: -view.x / view.z, y: -view.y / view.z,
                  width: size.w / view.z, height: size.h / view.z,
                  fill: C.accentSoft, fillOpacity: 0.45,
                  stroke: C.accent, strokeWidth: 1.5 / minimap.scale,
                  rx: 6,
                }))))
          : null,

        nodes.length === 0
          ? h('div', {
            style: {
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', pointerEvents: 'none',
            },
          }, h('div', { style: { textAlign: 'center', color: C.ink3 } },
            h('div', { style: { fontSize: 13, color: C.ink2, marginBottom: 6 } }, T('view.empty.title')),
            h('div', { style: { fontSize: 11.5, lineHeight: 1.7 } },
              T('view.empty.hint')),
            h('div', { style: { fontSize: 11, marginTop: 4 } },
              T('view.empty.report', {
                events: snapshot.meta.events,
                state: snapshot.meta.openState || '—',
              }))))
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
        // The two layout directions: one parent, two children, drawn the way
        // the tree reads in that direction.
        layoutVertical: 'M8 2v3M4 5h8M4 5v4M12 5v4M4 11h.01M12 11h.01',
        layoutHorizontal: 'M2 8h3M5 4v8M5 4h4M5 12h4M11 4h.01M11 12h.01',
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
    // A segment inside the layout group: same hit area as an icon button, but
    // it borrows the group's border instead of drawing its own.
    const BTN_SEGMENT = 'dsh-tree-btn dsh-tree-btn--icon dsh-tree-btn--segment';
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
            h('div', { style: { fontWeight: 600, marginBottom: 6 } }, T('error.title')),
            h('div', { style: { color: C.ink2, fontFamily: MONO } }, this.state.error),
            h('div', {
              style: {
                color: C.ink3, fontFamily: MONO, fontSize: 10.5,
                whiteSpace: 'pre-wrap', marginTop: 8,
              },
            }, this.state.stack),
            h('button', {
              onClick: () => this.setState({ error: null, stack: '' }),
              style: {
                marginTop: 14, border: '1px solid ' + C.buttonFill, background: C.buttonFill, color: C.onAccent,
                borderRadius: 8, fontSize: 12, padding: '4px 12px', cursor: 'pointer', fontFamily: FONT,
              },
            }, T('error.reload')),
            h('span', { style: { color: C.ink3, fontSize: 11, marginLeft: 10 } },
              T('error.hint')));
        }
        return this.props.children;
      }
    }

    /**
     * The full-screen reader.
     *
     * A native <dialog> opened with `showModal()`, not a hand-built overlay.
     * The browser then owns everything that is easy to get wrong here: focus is
     * contained, the page behind is inert, Esc and the back gesture close it,
     * and it renders in the top layer — which matters here because a card lives
     * inside the transformed canvas, so a positioned child of it would be
     * clipped and scaled along with the canvas.
     *
     * The plugin therefore writes no focus trap, no Tab handler, no Esc handler
     * and no focus restoration; it only mirrors the element's `close` event back
     * into React state.
     */
    function Reader({ node, open, onClose }) {
      useLocale();
      const dialogRef = useRef(null);
      const close = useRef(onClose);
      close.current = onClose;

      // `show()` would leave the page interactive; the reader is blocking.
      useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return undefined;
        if (open) {
          if (!dialog.open) {
            if (typeof dialog.showModal === 'function') dialog.showModal();
            else dialog.setAttribute('open', '');
          }
        } else if (dialog.open) {
          dialog.close();
        }
        return undefined;
      }, [open, node && node.id]);

      // Esc, the back gesture and light dismiss all end in a `close` event.
      useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return undefined;
        const onDismiss = () => close.current();
        dialog.addEventListener('close', onDismiss);
        return () => dialog.removeEventListener('close', onDismiss);
      }, []);

      if (!node) return null;
      const titleId = 'dsh-tree-reader-title-' + (node.id || 'node');
      return h('dialog', {
        ref: dialogRef,
        className: 'dsh-tree-reader',
        // The modal already carries role="dialog" and aria-modal: adding them
        // here would announce the overlay twice.
        'aria-labelledby': titleId,
        // Click-outside dismissal. Where `closedby` is unsupported the dialog
        // still closes on Esc and the back gesture, so this only degrades.
        closedby: 'any',
      },
          h('div', {
            style: {
              padding: '14px 20px 11px', borderBottom: '1px solid ' + C.line,
              display: 'flex', alignItems: 'flex-start', gap: 12,
            },
          },
            h('div', { style: { flex: 1, minWidth: 0 } },
              h('div', {
                style: { fontSize: 10.5, color: C.ink3, letterSpacing: '0.05em', marginBottom: 4 },
              }, (node.kind === 'branch' ? T('reader.branch') : T('reader.mainline')) + ' · ' + (node.id || '')),
              h('div', {
                id: titleId,
                style: { fontSize: 15, fontWeight: 600, lineHeight: 1.5, color: C.ink },
              }, node.question || T('card.noQuestion'))),
            h('button', {
              onClick: onClose,
              title: T('reader.close'),
              'aria-label': T('reader.closeLabel'),
              className: 'dsh-tree-btn dsh-tree-btn--icon',
              style: { width: 30, height: 30, minWidth: 30, minHeight: 30 },
            }, h(Icon, { name: 'close' }))),
          h('div', {
            className: 'dsh-tree-scroll',
            style: {
              padding: '18px 22px 22px', overflow: 'auto', flex: 1,
              ...MD.body, fontSize: 13.4, lineHeight: 1.85,
            },
          },
            // The thinking comes first: it is what the reader opened the
            // card for, and folding it keeps the answer itself at the top
            // of the eye.
            h(ReasoningDisclosure, { node }),
            node.answer ? renderMarkdown(node.answer) : T('reader.noAnswer')),

          h('div', {
            style: {
              padding: '8px 20px', borderTop: '1px solid ' + C.cardEdge, fontSize: 10.5,
              color: C.ink3, display: 'flex', gap: 10, alignItems: 'center',
            },
          },
            h('span', null, T('reader.hint')),
            h('span', { style: { flex: 1 } }),
            node.cost && (node.cost.ms || node.cost.tokens)
              ? h('span', null, formatCost(node.cost))
              : null));
    }

    function TreeView(props) {
      const { sessionId, api } = props;
      useLocale();
      const rootId = useMemo(() => api.rootOf(sessionId), [sessionId, api]);
      const store = useMemo(() => api.storeFor(rootId), [rootId, api]);
      const [, force] = useState(0);
      const anchorRef = useRef(null);
      const hostRef = useRef(null);
      const [surface, setSurface] = useState(null);
      const [size, setSize] = useState({ w: 0, h: 0, top: 0, bottom: 0 });

      useEffect(() => store.subscribe(() => force((n) => n + 1)), [store]);
      useEffect(() => {
        api.ensureOpen(rootId, store);
      }, [rootId, store, api]);
      useEffect(() => {
        const anchor = anchorRef.current;
        const body = anchor && anchor.closest('[data-conversation-content]');
        const container = body && body.parentElement;
        const header = container && (container.querySelector(':scope > header') ||
          container.querySelector(':scope > [data-slot="conversation.header"] > header'));
        const composer = body && body.querySelector('[data-composer-seat]');
        if (!container || !header || !composer) return;
        try {
          const { createPortal } = require('react-dom');
          if (typeof createPortal !== 'function') return;
          setSize({ w: 0, h: 0, top: 0, bottom: 0 });
          setSurface({ container, header, composer, createPortal });
        } catch (error) {
          /* Hosts without a portal keep the canvas inside the view. */
        }
      }, []);
      useEffect(() => {
        const element = hostRef.current;
        if (!element) return undefined;
        const measure = () => {
          const rect = element.getBoundingClientRect();
          const top = surface ? Math.max(0, surface.header.getBoundingClientRect().bottom - rect.top) : 0;
          const bottom = surface ? Math.max(0, rect.bottom - surface.composer.getBoundingClientRect().top) : 0;
          setSize({ w: element.clientWidth, h: element.clientHeight, top, bottom, container: surface ? surface.container : null });
        };
        measure();
        if (typeof ResizeObserver === 'undefined') {
          window.addEventListener('resize', measure);
          return () => window.removeEventListener('resize', measure);
        }
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        if (surface) {
          observer.observe(surface.header);
          observer.observe(surface.composer);
        }
        return () => observer.disconnect();
      }, [surface]);

      const snapshot = store.getSnapshot();
      const reading = snapshot.readingId ? store.getNode(snapshot.readingId) : undefined;
      const readerNode = useRef(null);
      if (reading) readerNode.current = reading;

      const canvas = h('div', {
        ref: hostRef,
        className: surface ? 'dsh-tree-root dsh-tree-root--overlay' : 'dsh-tree-root',
        style: {
          position: surface ? 'absolute' : 'relative', inset: surface ? 0 : undefined,
          width: '100%', height: '100%', minHeight: 0, zIndex: surface ? (reading ? 20 : 1) : undefined,
          overflow: 'hidden', fontFamily: FONT, color: C.ink, background: C.canvas,
        },
      },
        h(Boundary, null, h(Canvas, { key: rootId, store, api, rootId, size, ready: !surface || size.container === surface.container })),
        h(Reader, { key: rootId, node: reading || readerNode.current, open: Boolean(reading), onClose: () => store.closeReader() }));
      return h('div', { ref: anchorRef, style: { width: '100%', height: '100%', minHeight: 0, flex: '1 1 0' } },
        surface ? surface.createPortal(canvas, surface.container) : canvas);
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
        '.dsh-tree-root { --tree-fast: 120ms; --tree-enter: 240ms; --tree-exit: ' + MOTION_EXIT_MS + 'ms; --tree-ease: cubic-bezier(.2,.8,.2,1); --tree-spring: cubic-bezier(.16,1.3,.3,1); }',
        // Elevation in two themes. A black-alpha shadow is what gives a card depth
        // on a white canvas, and on a dark canvas it is invisible — the surface
        // has to separate by a heavier shadow instead. The three levels are
        // declared once and read by both themes.
        '.dsh-tree-root { --dsh-tree-shadow-1: 0 2px 8px rgba(0,0,0,0.05); --dsh-tree-shadow-2: 0 8px 22px rgba(0,0,0,0.12); --dsh-tree-shadow-3: 0 20px 60px rgba(0,0,0,0.28); }',
        'body[data-ds-dark-theme] .dsh-tree-root { --dsh-tree-shadow-1: 0 2px 10px rgba(0,0,0,0.45); --dsh-tree-shadow-2: 0 10px 28px rgba(0,0,0,0.55); --dsh-tree-shadow-3: 0 22px 64px rgba(0,0,0,0.65); }',
        // Native affordances follow the host theme too: form controls and
        // scrollbars take their colour from `color-scheme`, and the plugin's own
        // scroll areas use the host's scrollbar tokens.
        '.dsh-tree-root { color-scheme: light; }',
        'body[data-ds-dark-theme] .dsh-tree-root { color-scheme: dark; }',
        '.dsh-tree-clamp-2, .dsh-tree-clamp-3 {',
        '  display: -webkit-box; -webkit-box-orient: vertical;',
        '  -webkit-line-clamp: 2; line-clamp: 2;',
        '  overflow: hidden; overflow-wrap: break-word;',
        '}',
        '.dsh-tree-clamp-3 { -webkit-line-clamp: 3; line-clamp: 3; }',
        '.dsh-tree-one-line {',
        '  min-inline-size: 0; overflow: hidden; text-overflow: ellipsis;',
        '  white-space: nowrap;',
        '}',
        '.dsh-tree-scroll { scrollbar-width: thin; scrollbar-color: var(--dsw-alias-scrollbar-bg-l1) transparent; }',
        '.dsh-tree-scroll:hover { scrollbar-color: var(--dsw-alias-scrollbar-hover-l1) transparent; }',
        // Tables: a wide one scrolls sideways inside its own wrapper instead of
        // widening the card or the reader. The wrapper is the scroll container,
        // so the table keeps its natural width and cells stay on one line.
        '.dsh-tree-table-wrap {',
        '  max-width: 100%; margin: 0.7em 0; overflow-x: auto;',
        '  scrollbar-width: thin; scrollbar-color: var(--dsw-alias-scrollbar-bg-l1) transparent;',
        '}',
        '.dsh-tree-table {',
        '  border-collapse: collapse; font-size: 0.93em; line-height: 1.5;',
        '  width: max-content; min-width: 100%;',
        '}',
        '.dsh-tree-table th, .dsh-tree-table td {',
        '  border: 1px solid var(--dsw-alias-border-l1); padding: 6px 10px;',
        '  vertical-align: top; overflow-wrap: break-word;',
        '}',
        '.dsh-tree-table th {',
        '  font-weight: 600; white-space: nowrap;',
        '  background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);',
        '}',
        '.dsh-tree-table tbody tr:nth-child(even) td {',
        '  background: color-mix(in srgb, var(--dsw-alias-label-primary) 2%, transparent);',
        '}',
        ':has(> .dsh-tree-root--overlay) > header, :has(> .dsh-tree-root--overlay) > [data-slot="conversation.header"] > header { position: relative; z-index: 2; }',
        ':has(> .dsh-tree-root--overlay) > [data-conversation-content] [data-composer-seat]:not(:has([data-conversation-composer-overlay])) { width: min(100%, calc(var(--dsh-composer-card-max-width, 920px) + 2 * var(--dsh-composer-side-clearance, 16px))); align-self: center; background: transparent !important; }',
        '@keyframes dshTreeReveal { from { opacity: 0; transform: translateY(6px) scale(.985); } to { opacity: 1; transform: none; } }',
        '@keyframes dshTreeDismiss { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(3px) scale(.99); } }',
        '.dsh-tree-card { transition: opacity var(--tree-enter) var(--tree-ease), box-shadow var(--tree-enter) var(--tree-ease), border-color var(--tree-fast) ease; }',
        '.dsh-tree-card--enter { animation: dshTreeReveal var(--tree-enter) var(--tree-ease); }',
        '.dsh-tree-presence[data-open="true"] { animation: dshTreeReveal var(--tree-enter) var(--tree-ease); }',
        '.dsh-tree-presence[data-open="false"] { pointer-events: none; animation: dshTreeDismiss var(--tree-exit) ease-in forwards; }',
        '.dsh-tree-menu { transform-origin: top right; }',
        '.dsh-tree-menu[data-open="true"] { animation-timing-function: var(--tree-spring); }',
        '.dsh-tree-composer { transform-origin: top center; }',
        // The reader is a native modal dialog; only its surface and its enter/exit
        // transition belong to the plugin.
        '.dsh-tree-reader {',
        '  margin: auto; padding: 0; border: none; margin-block: auto;',
        '  width: min(820px, calc(100vw - 68px)); max-width: calc(100vw - 68px);',
        '  max-height: calc(100vh - 56px);',
        '  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);',
        '  border-radius: 14px; box-shadow: var(--dsh-tree-shadow-3); overflow: hidden;',
        // MANDATORY: without this, a scroll inside the dialog chains to the page
        // behind it as soon as the dialog reaches its own scroll boundary.
        '  overscroll-behavior: contain;',
        '  opacity: 0;',
        // MANDATORY for the top layer: display and overlay are discrete, and the
        // element has to stay in the top layer while it animates out.
        '  transition-property: opacity, transform, display, overlay;',
        '  transition-duration: var(--tree-exit);',
        '  transition-timing-function: ease-out;',
        '  transition-behavior: allow-discrete;',
        '}',
        // display is set only while open: an unconditional display would override
        // the closed state and leave the dialog permanently on screen.
        '.dsh-tree-reader[open] {',
        '  display: flex; flex-direction: column; opacity: 1;',
        '  transition-duration: var(--tree-enter);',
        '}',
        '@media (prefers-reduced-motion: no-preference) {',
        '  .dsh-tree-reader { transform: translateY(6px) scale(.985); }',
        '  .dsh-tree-reader[open] { transform: none; }',
        '}',
        '@starting-style { .dsh-tree-reader[open] { opacity: 0; } }',
        // MANDATORY: ::backdrop is not a scroll container by default, so
        // overscroll-behavior alone would not stop a gesture over the backdrop
        // from scrolling the page underneath.
        '.dsh-tree-reader::backdrop {',
        '  background: var(--dsw-alias-bg-mask-1);',
        '  overflow: hidden; overscroll-behavior: contain;',
        '}',
        // Every control shares one geometry so the toolbar reads as one row.
        '.dsh-tree-btn {',
        '  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);',
        '  color: var(--dsw-alias-label-secondary); border-radius: 8px;',
        '  font-family: inherit; font-size: 12px; line-height: 20px;',
        '  min-height: 32px; min-width: 32px; padding: 5px 10px;',
        '  display: inline-flex; align-items: center; justify-content: center; gap: 6px;',
        '  white-space: nowrap; flex-shrink: 0; box-sizing: border-box; cursor: pointer;',
        '  transition: background var(--tree-fast) ease, border-color var(--tree-fast) ease, color var(--tree-fast) ease, transform 180ms var(--tree-spring);',
        '}',
        '.dsh-tree-btn:hover:not([disabled]) {',
        '  background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);',
        '  border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary);',
        '}',
        '.dsh-tree-btn:active:not([disabled]) {',
        '  transform: scale(.96); transition-duration: 70ms;',
        '  background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);',
        '}',
        '.dsh-tree-btn:focus-visible {',
        '  outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px;',
        '}',
        '.dsh-tree-btn[disabled] { opacity: 0.45; cursor: default; }',
        '.dsh-tree-btn[aria-pressed="true"] { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); }',
        '.dsh-tree-btn--icon { padding: 0; min-width: 30px; min-height: 30px; }',
        '.dsh-tree-btn--segment {',
        '  border-color: transparent; background: transparent;',
        '  min-width: 28px; min-height: 26px; border-radius: 7px; color: var(--dsw-alias-label-tertiary);',
        '}',
        '.dsh-tree-btn--segment:hover:not([disabled]) {',
        '  border-color: transparent; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);',
        '}',
        '.dsh-tree-btn--segment[aria-pressed="true"], .dsh-tree-btn--segment[aria-pressed="true"]:hover {',
        '  border-color: transparent; color: var(--dsw-alias-brand-primary);',
        '  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);',
        '}',
        '.dsh-tree-btn--primary {',
        '  background: var(--dsw-alias-button-primary-fill); border-color: var(--dsw-alias-button-primary-fill);',
        '  color: var(--dsw-alias-label-primary-foreground);',
        '}',
        '.dsh-tree-btn--primary:hover:not([disabled]) {',
        '  background: var(--dsw-alias-button-primary-hover);',
        '  border-color: var(--dsw-alias-button-primary-hover);',
        '  color: var(--dsw-alias-label-primary-foreground);',
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
        // The chevron is a block-level <svg>; without an inline-flex box it takes
        // its own line and doubles the pill's height.
        '  display: inline-flex; align-items: center; gap: 4px; box-sizing: border-box;',
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
        '.dsh-tree-ask svg { transition: transform var(--tree-enter) var(--tree-spring); }',
        '.dsh-tree-ask[aria-expanded="true"] svg { transform: rotate(45deg); }',
        '.dsh-tree-chip, .dsh-tree-link { transition: background var(--tree-fast) ease, color var(--tree-fast) ease, transform 180ms var(--tree-spring); }',
        '.dsh-tree-chip:active, .dsh-tree-link:active { transform: scale(.97); transition-duration: 70ms; }',
        '.dsh-tree-chip:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }',
        '.dsh-tree-link svg, .dsh-tree-chip svg { transition: transform var(--tree-enter) var(--tree-ease); }',
        '.dsh-tree-textarea { transition: border-color var(--tree-fast) ease, box-shadow var(--tree-fast) ease; }',
        '.dsh-tree-textarea:focus { border-color: var(--dsw-alias-brand-primary) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); }',
        '@media (hover: hover) { .dsh-tree-btn:hover:not([disabled]):not(:active) { transform: translateY(-1px); } }',
        '@media (prefers-reduced-motion: reduce) {',
        '  .dsh-tree-root *, .dsh-tree-root *::before, .dsh-tree-root *::after { animation: none !important; transition: none !important; }',
        '  .dsh-tree-root .dsh-tree-btn, .dsh-tree-root .dsh-tree-chip, .dsh-tree-root .dsh-tree-link { transform: none !important; }',
        '  .dsh-tree-presence[data-open="false"] { display: none; }',
        '}',
      ].join('\n');
      document.head.appendChild(style);
    }

    return {
      inject: ['slots', 'sessions', 'locale'],
      apply(ctx) {
        ensureStyles();
        const runtime = createRuntime(ctx);

        // The locale service owns the visible language. Registering the
        // dictionary under our own namespace keeps the plugin's copy out of
        // the shared "common" namespace, and the service's fallback chain
        // serves English to any language we did not translate.
        try {
          ctx.effect(() => ctx.locale.register(NS, DICT), 'dsh-explore: locale dictionaries');
        } catch (error) {
          // A profile without the locale plugin still gets the built-in table.
        }

        const bind = () => {
          try {
            const translate = ctx.locale.bind(NS);
            localeBridge.translate = (key, params) => translate(key, params);
          } catch (error) {
            localeBridge.translate = fallbackTranslate;
          }
        };
        bind();
        try {
          ctx.effect(() => ctx.locale.subscribe(() => {
            bind();
            for (const listener of [...localeListeners]) {
              try { listener(); } catch (error) { /* a listener must not break the rest */ }
            }
          }), 'dsh-explore: locale subscription');
        } catch (error) {
          /* keep the fallback translator */
        }

        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: 'tree',
          order: 5,
          // A thunk is re-read on every projection, so the tab follows the
          // active language instead of freezing one string at mount time.
          label: () => T('view.tab'),
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
