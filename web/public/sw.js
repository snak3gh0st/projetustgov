self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'Projetus — CNPJ Monitorado'
  const options = {
    body: data.body || 'Um CNPJ monitorado recebeu atualização',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: data.url || '/monitorar' }
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data.url || '/monitorar'))
})
