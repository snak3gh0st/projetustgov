---
phase: quick-16
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/scripts/assign-paulo-cnpjs.js
autonomous: true
requirements:
  - QUICK-16
must_haves:
  truths:
    - "All 73 target CNPJs are assigned to Paulo in vendedor_projetos"
    - "Script reports exactly how many rows were updated"
    - "Script reports any CNPJs from the list not found in the database"
  artifacts:
    - path: "web/scripts/assign-paulo-cnpjs.js"
      provides: "One-shot bulk reassignment script for Paulo's CNPJ list"
  key_links:
    - from: "web/scripts/assign-paulo-cnpjs.js"
      to: "vendedor_projetos table"
      via: "UPDATE ... WHERE cnpj = ANY($1)"
      pattern: "UPDATE vendedor_projetos"
---

<objective>
Create and run a one-shot Node.js script that reassigns ~73 specific CNPJs to Paulo (paulo@projetus.org) in the vendedor_projetos table.

Purpose: Paulo needs a specific set of leads assigned to him. A direct DB script is the safest and fastest approach — one UPDATE, idempotent, verifiable.
Output: web/scripts/assign-paulo-cnpjs.js (script), plus console report of rows updated and missing CNPJs.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Existing script pattern to follow: web/scripts/distribute-leads.js (uses require('pg'), reads .env.local manually, Pool with ssl: { rejectUnauthorized: false })
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create and run the bulk CNPJ assignment script for Paulo</name>
  <files>web/scripts/assign-paulo-cnpjs.js</files>
  <action>
Create web/scripts/assign-paulo-cnpjs.js using the same pattern as distribute-leads.js (CommonJS, require('pg'), manual .env.local parse from __dirname/../.env.local, Pool with ssl: { rejectUnauthorized: false }).

Script logic:
1. Look up Paulo's ID: SELECT id FROM users WHERE email = 'paulo@projetus.org'
   - If not found, exit with error.
2. Define the target CNPJ list (hardcoded array of strings — no leading zeros stripped, exact values as given):
   ['08865455000181','11458210000144','38307313000160','27851981000137','26509885000142','05740074000188','07388151000108','46203548000130','08792836000188','29830688000119','20072173000122','28786425000197','07001227000109','19434527000152','10698627000111','17691694000153','11423403000160','02560548000111','03412091000160','51561819000169','02254698000105','36355443000142','08466173000101','05600136000156','01033253000124','00204349000145','32005699000179','17652052000145','00102556000199','19592920000174','16807889000153','01718634000147','27959638000100','10408525000114','28735847000133','23863410000161','18133211000168','40696176000144','08836901000120','08331438000164','06186691000146','09340727000192','10569203000157','01038483000186','11179956000119','09299439000131','31840523000170','07408794000176','11881500000104','10935772000179','10802204000108','05312072000198','03621549000191','05429826000194','07577063000154','41771121000114','35393233000186','24164662000165','23291629000133','03637196000118','04093667000137','17704372000100','05994449000136','29426258000136','05283553000112','46758416000174','42165949000191','74087016000110','17982835000197','29084014000112','24649294000145','22415807000128','00455609000155']
3. Run the UPDATE:
   UPDATE vendedor_projetos SET vendedor_id = $1, updated_at = NOW() WHERE cnpj = ANY($2)
   Capture rowCount.
4. Check which CNPJs were actually updated: run SELECT DISTINCT cnpj FROM vendedor_projetos WHERE cnpj = ANY($1) AND vendedor_id = $2 to get confirmed list.
5. Compute not_found = target CNPJs minus confirmed list.
6. Print:
   - Paulo's user ID
   - Rows updated: N
   - CNPJs confirmed assigned: M
   - CNPJs NOT found in DB: list them (or "none")
7. Call pool.end() and exit.

Then run the script immediately after writing it:
  node /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/scripts/assign-paulo-cnpjs.js
  </action>
  <verify>
Script exits 0. Console output shows:
- "Rows updated: N" where N > 0
- "CNPJs confirmed assigned: M"
- Any missing CNPJs listed explicitly (expected to be few or none)

Cross-check with a quick DB query:
  node -e "
    const {Pool}=require('pg'),fs=require('fs'),path=require('path');
    const env={};fs.readFileSync(path.join('/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web','.env.local'),'utf8').split('\n').forEach(l=>{const m=l.match(/^([^=]+)=(.*)$/);if(m)env[m[1]]=m[2]});
    const pool=new Pool({connectionString:env.DATABASE_URL||env.POSTGRES_URL,ssl:{rejectUnauthorized:false}});
    pool.query(\"SELECT COUNT(DISTINCT cnpj) FROM vendedor_projetos vp JOIN users u ON vp.vendedor_id=u.id WHERE u.email='paulo@projetus.org'\").then(r=>console.log('Paulo CNPJ count:',r.rows[0].count)).finally(()=>pool.end())
  "
  </verify>
  <done>vendedor_projetos rows for all provided CNPJs have vendedor_id = Paulo's UUID. The DB count of Paulo's distinct CNPJs increased by the number of successfully assigned CNPJs from this list.</done>
</task>

</tasks>

<verification>
Run the cross-check query in the verify section above. Paulo's distinct CNPJ count should reflect all successfully assigned CNPJs from the target list.
</verification>

<success_criteria>
All CNPJs from the 73-item list that exist in vendedor_projetos are now assigned to paulo@projetus.org. Any CNPJs absent from the DB are reported so the operator knows they don't exist in the system.
</success_criteria>

<output>
After completion, create `.planning/quick/16-redistribuir-cnpjs-espec-ficos-para-paul/16-SUMMARY.md`
</output>
