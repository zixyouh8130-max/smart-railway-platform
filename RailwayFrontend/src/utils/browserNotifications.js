const isLocalhost = () => (
  typeof window !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(window.location.hostname)
);

export const isStandaloneDisplay = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator.standalone === true;
};

export const isIOSBrowser = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export const getNotificationCapability = () => {
  if (typeof window === 'undefined') {
    return { systemSupported: false, secure: false, permission: 'default' };
  }

  const secure = window.isSecureContext || isLocalhost();
  const systemSupported = 'Notification' in window;

  return {
    systemSupported,
    secure,
    permission: systemSupported ? Notification.permission : 'unsupported',
    serviceWorkerSupported: 'serviceWorker' in navigator,
    iosInstallRequired: isIOSBrowser() && !isStandaloneDisplay(),
  };
};

export const registerRailwayServiceWorker = async () => {
  const capability = getNotificationCapability();
  if (!capability.secure || !capability.serviceWorkerSupported) return null;

  try {
    const registration = await navigator.serviceWorker.register('/railway-sw.js');
    await navigator.serviceWorker.ready;
    return registration;
  } catch (error) {
    console.warn('Railway notification service worker registration failed:', error);
    return null;
  }
};

export const requestRailwayNotificationPermission = async () => {
  const capability = getNotificationCapability();

  if (!capability.secure) {
    return {
      granted: false,
      mode: 'in-app',
      message: 'စနစ်အသိပေးချက်အတွက် HTTPS လိုအပ်ပါသည်။ စာမျက်နှာအတွင်း အသိပေးချက်ကိုသာ အသုံးပြုနိုင်ပါသည်။',
    };
  }

  if (capability.iosInstallRequired) {
    return {
      granted: false,
      mode: 'in-app',
      message: 'iPhone/iPad တွင် စနစ်အသိပေးချက်ရယူရန် ဤဝဘ်ဆိုက်ကို Home Screen သို့ Add လုပ်ပြီး ထို app မှ ပြန်ဖွင့်ပါ။ ယခုတွင် စာမျက်နှာအတွင်း အသိပေးချက်ကို ဆက်လက်ပြပါမည်။',
    };
  }

  if (!capability.systemSupported) {
    return {
      granted: false,
      mode: 'in-app',
      message: 'ဤဘရောက်ဇာသည် စနစ်အသိပေးချက်ကို မပံ့ပိုးသေးပါ။ စာမျက်နှာအတွင်း အသိပေးချက်ကို ဆက်လက်ပြပါမည်။',
    };
  }

  try {
    const permission = Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;

    if (permission !== 'granted') {
      return {
        granted: false,
        mode: 'in-app',
        message: 'ဘရောက်ဇာအသိပေးချက် ခွင့်ပြုချက် မရရှိပါ။ စာမျက်နှာအတွင်း အသိပေးချက်ကို ဆက်လက်ပြပါမည်။',
      };
    }

    await registerRailwayServiceWorker();

    return {
      granted: true,
      mode: 'system',
      message: 'စနစ်အသိပေးချက် ဖွင့်ထားပါပြီ။',
    };
  } catch (error) {
    console.warn('Notification permission request failed:', error);
    return {
      granted: false,
      mode: 'in-app',
      message: 'စနစ်အသိပေးချက်ကို ဖွင့်၍ မရသဖြင့် စာမျက်နှာအတွင်း အသိပေးချက်ကို ဆက်လက်ပြပါမည်။',
    };
  }
};

export const showRailwaySystemNotification = async ({
  title,
  body,
  tag,
  url,
}) => {
  const capability = getNotificationCapability();
  if (!capability.systemSupported || Notification.permission !== 'granted') {
    return false;
  }

  const options = {
    body,
    tag,
    renotify: false,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url: url || window.location.href },
  };

  try {
    if (capability.serviceWorkerSupported) {
      const registration = await registerRailwayServiceWorker();
      if (registration) {
        await registration.showNotification(title, options);
        return true;
      }
    }

    // Desktop fallback for browsers where a service worker is unavailable.
    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      if (url) window.location.assign(url);
      notification.close();
    };
    return true;
  } catch (error) {
    console.warn('System notification delivery failed:', error);
    return false;
  }
};
