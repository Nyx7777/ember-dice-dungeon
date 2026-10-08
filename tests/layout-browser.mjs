import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {battle} from './helpers.mjs';
import {SKILLS} from '../dist/data.js';
import {serialize} from '../dist/engine.js';

// Stress the longest upgraded skill text, not only the starting loadout.
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage();const results=[];
try{
  await page.goto('http://localhost:4173');
  for(const [width,height]of [[360,640],[390,844]])for(const branch of [0,1]){
    const s=battle();s.upgrades=Object.fromEntries(SKILLS.map(k=>[k.id,branch]));
    await page.setViewportSize({width,height});await page.evaluate(raw=>localStorage.setItem('ember-dungeon-save-v1',raw),serialize(s));await page.reload();await page.locator('.skill-grid').waitFor();
    const overflow=await page.evaluate(()=>[...document.querySelectorAll('.skill-card')].flatMap(card=>{
      const parent=card.getBoundingClientRect();return [...card.querySelectorAll('.skill-top,.skill-effect,.cost,small')].filter(el=>{const r=el.getBoundingClientRect();return r.right>parent.right+1||r.bottom>parent.bottom+1;}).map(el=>({text:el.textContent,card:card.dataset.skill}));
    }));
    assert.deepEqual(overflow,[],`${width} branch ${branch}: clipped skill information`);
    results.push(`${width}×${height}, all six branch-${branch} skill names / effects / costs / hints fit their cards.`);
    await mkdir('test-results',{recursive:true});await page.screenshot({path:`test-results/upgrades-${width}-${branch}.png`});
  }
  const preview=battle();await page.setViewportSize({width:390,height:844});
  await page.evaluate(raw=>localStorage.setItem('ember-dungeon-save-v1',raw),serialize(preview));await page.reload();
  await page.locator('[data-action="skill:cleave"]').click();
  assert.ok(await page.locator('[data-action="cast"]').isEnabled());
  await page.screenshot({path:'test-results/preview-390.png'});
  await writeFile('test-results/layout-report.json',JSON.stringify(results,null,2));console.log(results.join('\n'));
}finally{await browser.close();}
