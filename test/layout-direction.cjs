const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');
const start = source.indexOf('    function childrenMapOf(');
const end = source.indexOf('    // ------------------------------------------------------------------ store', start);
assert(start >= 0 && end > start, 'tree geometry functions are available');
const layoutTree = new Function('NODE_W', 'NODE_H', 'GAP_X', 'GAP_Y',
  source.slice(start, end) + '\nreturn layoutTree;')(320, 212, 44, 76);

const nodes = [
  { id: 'root', parentId: null },
  { id: 'a', parentId: 'root' },
  { id: 'a1', parentId: 'a' },
  { id: 'a2', parentId: 'a' },
  { id: 'b', parentId: 'root' },
  { id: 'b1', parentId: 'b' },
  { id: 'other', parentId: null },
];
const heights = { root: 420, a: 100, a1: 390, a2: 120, b: 280, b1: 80, other: 300 };
const vertical = layoutTree(nodes, {}, heights);
assert(vertical.positions.get('a').y > vertical.positions.get('root').y, 'default layout grows down');

const horizontal = layoutTree(nodes, {}, heights, 'horizontal');
for (const node of nodes) {
  const position = horizontal.positions.get(node.id);
  assert(position, `${node.id} is positioned`);
  assert(position.x >= 0 && position.y >= 0, `${node.id} is inside the canvas`);
  assert(position.x + 320 <= horizontal.width, `${node.id} fits the canvas width`);
  assert(position.y + heights[node.id] <= horizontal.height, `${node.id} fits the canvas height`);
  if (node.parentId) {
    const parent = horizontal.positions.get(node.parentId);
    assert(position.x >= parent.x + 320, `${node.id} is to the right of its parent`);
    const edge = horizontal.edges.find(item => item.id === `${node.parentId}>${node.id}`);
    assert(edge, `${node.id} has a connecting edge`);
    assert.equal(edge.x1, parent.x + 320);
    assert.equal(edge.y1, parent.y + heights[node.parentId] / 2);
    assert.equal(edge.x2, position.x);
    assert.equal(edge.y2, position.y + heights[node.id] / 2);
  }
}
for (let i = 0; i < nodes.length; i += 1) {
  for (let j = i + 1; j < nodes.length; j += 1) {
    const a = horizontal.positions.get(nodes[i].id);
    const b = horizontal.positions.get(nodes[j].id);
    const separated = a.x + 320 <= b.x || b.x + 320 <= a.x ||
      a.y + heights[nodes[i].id] <= b.y || b.y + heights[nodes[j].id] <= a.y;
    assert(separated, `${nodes[i].id} and ${nodes[j].id} do not overlap`);
  }
}
const folded = layoutTree(nodes, { a: true }, heights, 'horizontal');
assert(!folded.positions.has('a1') && !folded.positions.has('a2'), 'folded descendants leave the canvas');
assert(!folded.edges.some(edge => edge.id.startsWith('a>')), 'folded descendants have no edges');

let seed = 42;
const random = limit => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % limit; };
for (let run = 0; run < 100; run += 1) {
  const generated = [];
  const generatedHeights = {};
  const collapsed = {};
  for (let i = 0; i < 40; i += 1) {
    const id = String(i);
    generated.push({ id, parentId: i && random(10) ? String(random(i)) : null });
    generatedHeights[id] = 70 + random(500);
    if (random(6) === 0) collapsed[id] = true;
  }
  const result = layoutTree(generated, collapsed, generatedHeights, 'horizontal');
  const visible = [...result.positions.entries()];
  for (let i = 0; i < visible.length; i += 1) {
    for (let j = i + 1; j < visible.length; j += 1) {
      const [aId, a] = visible[i];
      const [bId, b] = visible[j];
      assert(a.x + 320 <= b.x || b.x + 320 <= a.x ||
        a.y + generatedHeights[aId] <= b.y || b.y + generatedHeights[bId] <= a.y,
      `generated layout ${run}: ${aId} and ${bId} overlap`);
    }
  }
}
console.log('LAYOUT OK: vertical and horizontal geometry, mixed heights, multiple roots, and folded branches');
