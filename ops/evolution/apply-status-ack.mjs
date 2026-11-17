// Backport of Evolution #2788 / Baileys #2883, restricted to the shipped rc.9 module.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const root = process.argv[2] || '/evolution/node_modules/baileys'
if (JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version !== '7.0.0-rc.9') throw new Error('Unexpected Baileys version; review patch before upgrading')
const file = resolve(root, 'lib/Socket/messages-recv.js')
let source = readFileSync(file, 'utf8')
if (createHash('sha256').update(source).digest('hex') !== '8b9329ddf95fa7a1785826d8861af236f5f055ff22a5ed1ce52afdf9565d873e') throw new Error('Unexpected Baileys module; refusing to patch')
const changes = [
  ['    const handleNotification = async (node) => {', `    const handleStatus = async (node) => {
        try {
            await sendMessageAck(node);
        } catch (error) {
            onUnexpectedError(error, 'acking status stanza');
        }
    };
    const handleNotification = async (node) => {`],
  ["            ['notification', handleNotification]\n", "            ['notification', handleNotification],\n            ['status', handleStatus]\n"],
  ["    ws.on('CB:ack,class:message', (node) => {", `    ws.on('CB:status', async (node) => {
        await processNode('status', node, 'handling status', handleStatus);
    });
    ws.on('CB:ack,class:message', (node) => {`],
]
for (const [before, after] of changes) {
  if (source.split(before).length !== 2) throw new Error('Patch anchor changed')
  source = source.replace(before, after)
}
writeFileSync(file, source)
console.log('Applied status ACK backport to Baileys rc.9')
