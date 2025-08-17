// popup.js - show grouped list and basic actions via background
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function gotoVideo(videoId, time) {
  const url = `https://www.youtube.com/watch?v=${videoId}&t=${time}s`;
  chrome.tabs.query({ url: "*://www.youtube.com/*" }, (tabs) => {
    if (tabs && tabs.length) {
      // focus existing tab
      chrome.tabs.update(tabs[0].id, { active: true, url });
    } else {
      chrome.tabs.create({ url });
    }
  });
}

function render(groups) {
  const root = document.getElementById('bookmarks');
  root.innerHTML = '';
  Object.entries(groups).forEach(([videoId, items]) => {
    const group = document.createElement('div');
    group.className = 'bookmark-group';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = `${videoId} (${items.length})`;
    title.addEventListener('click', () => group.querySelector('.bookmark-items').classList.toggle('hidden'));

    const list = document.createElement('div');
    list.className = 'bookmark-items';

    items.sort((a,b)=>a.time-b.time).forEach(bm => {
      const row = document.createElement('div');
      row.className = 'bookmark-item';

      const time = document.createElement('span');
      time.className = 'time';
      time.textContent = bm.timeLabel || formatTime(bm.time||0);
      time.style.cursor = 'pointer';
      time.addEventListener('click', ()=> gotoVideo(bm.videoId, bm.time));

      const note = document.createElement('input');
      note.type = 'text';
      note.value = bm.note || '';
      note.placeholder = '메모';
      note.addEventListener('change', () => {
        chrome.runtime.sendMessage({ action: 'updateBookmark', id: bm.id, patch: { note: note.value } });
      });

      const del = document.createElement('button');
      del.textContent = '삭제';
      del.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'deleteBookmark', id: bm.id }, refresh);
      });

      row.appendChild(time);
      row.appendChild(note);
      row.appendChild(del);
      list.appendChild(row);
    });

    group.appendChild(title);
    group.appendChild(list);
    root.appendChild(group);
  });
}

function groupByVideo(list) {
  return (list||[]).reduce((acc, it)=>{
    (acc[it.videoId] ||= []).push(it);
    return acc;
  }, {});
}

function refresh() {
  chrome.runtime.sendMessage({ action: 'getAllBookmarks' }, (res) => {
    const items = (res && res.ok && res.data) ? res.data : [];
    render(groupByVideo(items));
  });
}

document.getElementById('export').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'getAllBookmarks' }, (res) => {
    const items = (res && res.ok && res.data) ? res.data : [];
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bookmarks.json';
    a.click();
    URL.revokeObjectURL(url);
  });
});

document.getElementById('import').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const arr = JSON.parse(reader.result);
      chrome.runtime.sendMessage({ action: 'importBookmarks', items: arr }, refresh);
    } catch {
      alert('잘못된 JSON 파일입니다.');
    }
  };
  reader.readAsText(file);
});

document.getElementById('openNew').addEventListener('click', () => {
  //alert("fffffff");
  
  chrome.tabs.create({ url: chrome.runtime.getURL('bookmarks.html') });
});

document.getElementById('clear').addEventListener('click', () => {
  if (confirm('정말 모두 삭제할까요?')) {
    chrome.runtime.sendMessage({ action: 'clearBookmarks' }, refresh);
  }
});



refresh();
