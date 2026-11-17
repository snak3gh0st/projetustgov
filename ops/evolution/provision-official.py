#!/usr/bin/env python3
"""Run on btapps. Prompts never put tokens in argv, shell history or output.
Creates a SEPARATE WHATSAPP-BUSINESS instance; never replaces the QR instance.
"""
import argparse
import getpass
import json
import re
import subprocess
import sys

p = argparse.ArgumentParser()
p.add_argument('--evolution-container', required=True)
p.add_argument('--app-container', required=True)
p.add_argument('--instance', default='consultorias-oficial')
a = p.parse_args()
if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', a.instance):
    sys.exit('Nome de instância inválido')
try:
    inspected = json.loads(subprocess.check_output(['docker', 'inspect', a.app_container], stderr=subprocess.DEVNULL))[0]
    env = dict(item.split('=', 1) for item in inspected['Config']['Env'])
    qr_instance = env.get('WHATSAPP_INSTANCE', 'consultorias')
    if a.instance == qr_instance:
        sys.exit('A API oficial precisa de outra instância')
    secret = env['WHATSAPP_WEBHOOK_SECRET']
    app_url = env['NEXTAUTH_URL'].rstrip('/')
except (subprocess.CalledProcessError, KeyError, ValueError):
    sys.exit('Não foi possível carregar a configuração do aplicativo')
phone_id = input('Phone Number ID da Meta (não é o telefone): ').strip()
business_id = input('WhatsApp Business Account ID: ').strip()
if not phone_id.isdigit() or not business_id.isdigit():
    sys.exit('IDs da Meta devem conter somente dígitos')
token = getpass.getpass('Token de usuário de sistema da Meta (oculto): ')
if not token.strip():
    sys.exit('Token ausente')
body = {
    'instanceName': a.instance, 'integration': 'WHATSAPP-BUSINESS',
    'number': phone_id, 'businessId': business_id, 'token': token,
    'qrcode': False,
    'webhook': {'enabled': True, 'url': app_url + '/api/whatsapp/webhook', 'byEvents': False, 'base64': False,
                'headers': {'x-projete-secret': secret}, 'events': ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'CONNECTION_UPDATE', 'STATUS_INSTANCE']},
}
# The script executed in the container receives credentials ONLY on stdin.
js = r'''
const fs = require('fs');
(async () => {
 const body = JSON.parse(fs.readFileSync(0, 'utf8'));
 const headers = { apikey: process.env.AUTHENTICATION_API_KEY, 'Content-Type': 'application/json' };
 const base = 'http://127.0.0.1:' + (process.env.SERVER_PORT || '8080');
 const get = await fetch(base + '/instance/fetchInstances?instanceName=' + encodeURIComponent(body.instanceName), { headers, signal: AbortSignal.timeout(10000) });
 if (!get.ok) { console.log('Falha ao verificar instância: HTTP ' + get.status); process.exitCode = 1; return; }
 const existing = await get.json();
 if (!Array.isArray(existing)) throw new Error('Unexpected response');
 if (existing.length) { console.log('Instância já existe. Nenhuma configuração alterada. Confira a conta vinculada antes de prosseguir.'); process.exitCode = 1; return; }
 const res = await fetch(base + '/instance/create', { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
 console.log('Criação da instância oficial: HTTP ' + res.status);
 if (!res.ok) process.exitCode = 1;
})().catch(() => { console.log('Falha de comunicação; verifique o estado antes de repetir.'); process.exitCode = 1; });
'''
result = subprocess.run(['docker', 'exec', '-i', a.evolution_container, 'node', '-e', js], input=json.dumps(body).encode(), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
print(result.stdout.decode().strip())
if result.returncode:
    sys.exit(result.returncode)
print('Próximos passos: configurar o webhook da Meta no Evolution, testar recebimento/entrega e só então habilitar WHATSAPP_OFFICIAL_INSTANCE=' + a.instance + ' no PROJETE.')
print('Não foi alterado o número das consultorias nem habilitado o canal no aplicativo.')
