export interface PushNotificationPayload {
  title: string;
  body: string;
  tag?: string;
  icon?: string;
  data?: any;
}

/**
  * Requests browser permission for Push Notifications.
  */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('[NotificationService] Este navegador não suporta Notificações Desktop.');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  try {
    const permission = await Notification.requestPermission();
    console.log('[NotificationService] Permissão de notificação:', permission);
    return permission;
  } catch (error) {
    console.error('[NotificationService] Erro ao solicitar permissão de notificação:', error);
    return 'denied';
  }
}

/**
 * Checks current notification permission state.
 */
export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

/**
 * Sends a Push Notification via Service Worker registration or postMessage.
 */
export async function sendPushNotification(payload: PushNotificationPayload): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    const perm = await requestNotificationPermission();
    if (perm !== 'granted') {
      console.warn('[NotificationService] Permissão não concedida para enviar notificação.');
      return false;
    }
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    if (registration && registration.showNotification) {
      const options: any = {
        body: payload.body,
        icon: payload.icon || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🍬</text></svg>',
        vibrate: [150, 50, 150],
        tag: payload.tag || 'gummystock-alert',
        renotify: true,
        data: payload.data || { url: '/' },
        actions: [
          { action: 'open', title: 'Ver no ERP' }
        ]
      };
      await registration.showNotification(payload.title, options);
      return true;
    } else if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_NOTIFICATION',
        payload
      });
      return true;
    }
  } catch (error) {
    console.error('[NotificationService] Erro ao disparar notificação push pelo Service Worker:', error);
  }

  return false;
}

/**
 * Triggers a push alert when stock drops below minimum threshold.
 */
export async function notifyLowStock(
  productName: string,
  currentStock: number,
  minStock: number,
  locationName: string,
  productId?: string
) {
  const isZero = currentStock === 0;
  const title = isZero
    ? `🚨 ESTOQUE ZERADO: ${productName}`
    : `⚠️ ESTOQUE BAIXO: ${productName}`;
  
  const body = isZero
    ? `O produto ${productName} está com 0 unidades no local (${locationName}). Reposição urgente necessária!`
    : `O produto ${productName} atingiu ${currentStock} un (Mínimo: ${minStock}) no local (${locationName}).`;

  await sendPushNotification({
    title,
    body,
    tag: `low-stock-${productId || productName.replace(/\s+/g, '-').toLowerCase()}`,
    data: { url: '/', productId, type: 'low_stock' }
  });
}

/**
 * Triggers a push alert when a new NF entry is saved.
 */
export async function notifyNewNFEntry(
  nfNumber: string,
  supplierName: string,
  totalItems: number,
  totalValue: number
) {
  const formattedVal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue);
  
  await sendPushNotification({
    title: `📦 Nova Entrada de Nota Fiscal (NF ${nfNumber})`,
    body: `Fornecedor: ${supplierName}\nItens: ${totalItems} produto(s) • Total: ${formattedVal}`,
    tag: `nf-entry-${nfNumber}`,
    data: { url: '/', type: 'nf_entry' }
  });
}
