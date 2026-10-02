const fs=require('fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const dir=require('node:path').join(__dirname, '../examples/');
const load=f=>JSON.parse(fs.readFileSync(dir+f+'.json'));
for(const f of ['sales-to-google-sheets','approved-sheet-to-drafts','ai-inventory-assistant']){
 const w=load(f),names=new Set(w.nodes.map(n=>n.name));assert.equal(w.active,false);assert(!w.pinData);for(const n of w.nodes)assert(!n.credentials);
 for(const ports of Object.values(w.connections))for(const groups of Object.values(ports))for(const group of groups)for(const edge of group)assert(names.has(edge.node));
}
const run=(w,name,rows,lookup)=>vm.runInNewContext('(function(){'+w.nodes.find(n=>n.name===name).parameters.jsCode+'})()',{$input:{all:()=>rows.map(json=>({json})),first:()=>({json:rows[0]})},$:lookup});
const stock=load('approved-sheet-to-drafts'),validate=rows=>run(stock,'Validate approved rows',rows);
assert.equal(validate([{sku:'A',title:'Jacket',price:25,approved:'no'}]).length,0);
assert.equal(validate([{sku:'A',title:'Jacket',price:25,approved:'yes',fluf_listing_id:123}]).length,0);
assert.equal(validate([{sku:'A',title:'Jacket',price:25,approved:'yes'}])[0].json.sku,'A');
assert.throws(()=>validate([{sku:' A ',title:'Jacket',price:25,approved:'yes'}]),/spaces/);
assert.throws(()=>validate([{sku:'A',title:'Jacket',price:0,approved:'yes'}]),/positive/);
assert.throws(()=>validate([{sku:'A'},{sku:'A'}]),/Duplicate/);
const lookup=()=>({item:{json:{sku:'A',title:'Jacket',price:25}}});
assert.equal(run(stock,'Decide next step',[{}],lookup)[0].json.fluf_listing_id,'');
assert.equal(run(stock,'Decide next step',[{id:42}],lookup)[0].json.fluf_listing_id,42);
assert.equal(run(stock,'Keep created ID',[{id:43}],lookup)[0].json.fluf_listing_id,43);
assert.throws(()=>run(stock,'Keep created ID',[{}],lookup),/No listing/);
const sales=load('sales-to-google-sheets');assert.throws(()=>run(sales,'Prepare sale row',[{}]),/real sale/);
const sale={event_id:'event1',order_id:'order1',channel:'ebay',order_total:0,price:99,items:[{},{}]};
const r=run(sales,'Prepare sale row',[sale])[0].json;assert.equal(r.order_total,0);assert.equal(r.item_count,2);assert.equal(r.event_id,'event1');
assert.throws(()=>run(sales,'Prepare sale row',[{...sale,test:true}]),/real sale/);
const ai=load('ai-inventory-assistant');assert.equal(ai.nodes.find(n=>n.type.endsWith('flufConnectTool')).parameters.operation,'findListing');
console.log('Template graph, credential hygiene, approval, whitespace, duplicate SKU, missing match, recovery, totals and AI read-only checks passed.');
