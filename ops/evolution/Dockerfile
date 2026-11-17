# Same immutable base deployed on btapps. Does not change schema or session storage.
FROM evoapicloud/evolution-api@sha256:1bd8afc4a6cf48822e6cf02469aeae7bd35a12a6b616eacd1291926307f4d339
COPY apply-status-ack.mjs status-ack.test.mjs /opt/projete-evolution/
RUN node /opt/projete-evolution/apply-status-ack.mjs \
 && node --check /evolution/node_modules/baileys/lib/Socket/messages-recv.js \
 && node --experimental-import-meta-resolve --experimental-vm-modules --test /opt/projete-evolution/status-ack.test.mjs
