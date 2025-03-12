chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (!details.url.includes('/api/animal-registry')) return;
    
    const url = new URL(details.url);
    const params = {};
    
    // Собираем все параметры URL
    url.searchParams.forEach((value, key) => {
      if (params[key]) {
        // Если параметр уже есть, добавляем в массив
        params[key] = Array.isArray(params[key]) 
          ? [...params[key], value] 
          : [params[key], value];
      } else {
        params[key] = value;
      }
    });
    
    // Сохраняем домен и все параметры
    await chrome.storage.local.set({ 
      params,
      domain: url.hostname // t2-herriot.vetrf.ru или herriot.vetrf.ru
    });
  },
  { urls: ["https://t2-herriot.vetrf.ru/*", "https://herriot.vetrf.ru/*"] }
);