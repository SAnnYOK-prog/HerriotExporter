console.log('Popup script loaded');

document.getElementById('loadBirthDate').addEventListener('change', function() {
  document.getElementById('birthDateWarning').style.display = 
    this.checked ? 'block' : 'none';
});

let isCancelled = false;
const exportBtn = document.getElementById('exportBtn');
const cancelBtn = document.getElementById('cancelBtn');

exportBtn.addEventListener('click', async () => {
  isCancelled = false;
  exportBtn.disabled = true;
  if (cancelBtn) cancelBtn.style.display = 'block';

  try {
    const loadBirthDate = document.getElementById('loadBirthDate').checked;
    const { params, domain } = await chrome.storage.local.get(['params', 'domain']);
    
    if (!params || !domain) {
      showStatus('Сначала откройте страницу со списком животных', 'error');
      return;
    }

    let allItems = [];
    const perPage = 100;

    // Загрузка общего количества страниц
    const totalUrl = new URL(`https://${domain}/api/animal-registry/total`);
    Object.entries(params).forEach(([key, value]) => {
      if (key === 'page' || key === 'perPage') return;
      if (Array.isArray(value)) {
        value.forEach(v => totalUrl.searchParams.append(key, v));
      } else {
        totalUrl.searchParams.append(key, value);
      }
    });

    totalUrl.searchParams.set('page', 1);
    totalUrl.searchParams.set('perPage', perPage);

    const totalResponse = await fetch(totalUrl, { credentials: 'include' });
    const totalData = await totalResponse.json();
    let totalPages = totalData?.totalPages || 1;

    if (!totalData?.totalPages) {
      showStatus('Не удалось получить количество страниц', 'error');
    }

    // Загрузка данных постранично
    for (let page = 1; page <= totalPages; page++) {
      if (isCancelled) break;

      const url = new URL(`https://${domain}/api/animal-registry`);
      Object.entries(params).forEach(([key, value]) => {
        if (key === 'page' || key === 'perPage') return;
        if (Array.isArray(value)) {
          value.forEach(v => url.searchParams.append(key, v));
        } else {
          url.searchParams.append(key, value);
        }
      });

      url.searchParams.set('page', page);
      url.searchParams.set('perPage', perPage);

      showStatus(`Загрузка страницы ${page} из ${totalPages}...`);
      const response = await fetch(url, { credentials: 'include' });
      const data = await response.json();

      if (data?.data) {
        allItems = allItems.concat(data.data);
      }
    }

    if (!allItems.length || isCancelled) {
      showStatus('Загрузка прервана', 'error');
      return;
    }

    // Загрузка дат рождения
    if (loadBirthDate) {
      showStatus('Загрузка дополнительных данных...');
      const DELAY = 300;

      for (let i = 0; i < allItems.length; i++) {
        if (isCancelled) break;

        const item = allItems[i];
        try {
          const detailUrl = `https://${domain}/api/animal-registry/${item.uuid}`;
          const response = await fetch(detailUrl, { credentials: 'include' });
          const data = await response.json();
          item.birthDate = data.birthDate?.date?.split('T')[0] || '';

          if (i % 10 === 0) {
            showStatus(`Обработано ${i + 1} из ${allItems.length}`);
          }

          await new Promise(resolve => setTimeout(resolve, DELAY));
        } catch (error) {
          console.error(`Ошибка: ${error}`);
        }
      }
    }

    // Генерация CSV
    const csv = convertToCSV(allItems, loadBirthDate);
    saveAsCSV(csv);

  } catch (error) {
    showStatus(`Ошибка: ${error.message}`, 'error');
  } finally {
    exportBtn.disabled = false;
    if (cancelBtn) cancelBtn.style.display = 'none';
  }
});

cancelBtn.addEventListener('click', () => {
  isCancelled = true;
  showStatus('Загрузка отменена', 'error');
});

function convertToCSV(items, includeBirthDate) {
  if (!items?.length) return "";

  const processedItems = items.map(item => ({
    type: item.type,
    guid: item.guid,
    regionGuid: item.regionGuid,
    number: item.number,
    gender: item.gender,
    animalCode: item.animalCode?.name || "",
    keepingPurposes: item.keepingPurposes?.map(p => p.name).join('\n') || "",
    markingMeans: item.markingMeans?.map(m => {
      const types = {
        0: "Бирка", 1: "Микрочип", 2: "Тавро", 3: "Татуировка",
        4: "Болюс", 5: "Кольцо", 6: "Ошейник", 7: "Электронный ошейник",
        8: "Крыло-метка", 9: "Электронное крыло", 10: "Электронная метка",
        11: "Вырез тканей", 12: "Электронное кольцо", 13: "Табло"
      };
      return `${types[m.type] || 'Неизвестно'} ${m.number} ${m.status}`;
    }).join('\n') || "",
    ...(includeBirthDate && { birthDate: item.birthDate || "" })
  }));

  const headers = Object.keys(processedItems[0]).join(';');
  const rows = processedItems.map(item => 
    Object.values(item).map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')
  );

  return [headers, ...rows].join('\n');
}

function saveAsCSV(csv) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({
    url: url,
    filename: `animals_${Date.now()}.csv`,
    saveAs: true
  }, () => URL.revokeObjectURL(url));
}

function showStatus(text, type) {
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.className = `status-${type}`;
  }
}