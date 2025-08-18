// bookmarks-grouped.js - grouped by video title from indexedDB
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

let bookmarksData = [];
let sortOrder = 'desc'; // 'desc' for latest, 'asc' for oldest
let currentSearchQuery = '';
let currentTagFilter = null; // 현재 선택된 태그 필터
let isAllCollapsed = false; // 전체 접기/펼치기 상태

// 각 비디오 그룹별 정렬 상태를 저장하는 전역 객체
const videoSortState = {};
// 전체 북마크 페이지네이션 상태
const globalPaginationState = {
  currentPage: 1,
  pageSize: 5
};

// YouTube 탭 찾기 및 이동 (chrome.tabs API 사용)
function navigateToYouTube(videoId, time) {
  const targetUrl = `https://www.youtube.com/watch?v=${videoId}&t=${time}s`;
  
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.query({}, (tabs) => {
      let targetTab = null;
      for (const tab of tabs) {
        if (tab.url && tab.url.includes(`youtube.com/watch?v=${videoId}`)) {
          targetTab = tab;
          break;
        } 
      }
      
      if (targetTab) {
        chrome.tabs.update(targetTab.id, { active: true });
        chrome.tabs.sendMessage(targetTab.id, {
          type: 'navigateToBookmark',
          time: time
        });
        chrome.windows.update(targetTab.windowId, { focused: true });
      } else {
        chrome.tabs.create({ url: targetUrl });
      }
    });
  } else {
    window.open(targetUrl, '_blank');
  }
}

function renderTags() {
  const tagContainer = document.getElementById('tagContainer');
  tagContainer.innerHTML = '';
  
  const allTags = new Set();
  bookmarksData.forEach(bm => {
    if (bm.tags) {
      bm.tags.forEach(tag => allTags.add(tag.trim()));
    }
  });

  const sortedTags = Array.from(allTags).sort();

  // '전체 태그' 버튼 추가
  const allBtn = document.createElement('button');
  allBtn.className = `tag-btn${currentTagFilter === null ? ' active' : ''}`;
  allBtn.textContent = '전체 태그';
  allBtn.addEventListener('click', () => {
    currentTagFilter = null;
    currentSearchQuery = '';
    document.getElementById('searchInput').value = '';
    globalPaginationState.currentPage = 1;
    renderBookmarks();
  });
  tagContainer.appendChild(allBtn);

  sortedTags.forEach(tag => {
    if (tag) {
      const tagBtn = document.createElement('button');
      tagBtn.className = `tag-btn${currentTagFilter === tag ? ' active' : ''}`;
      tagBtn.textContent = tag;
      tagBtn.addEventListener('click', () => {
        if (currentTagFilter === tag) {
          // 같은 태그를 다시 클릭하면 필터 해제
          currentTagFilter = null;
        } else {
          currentTagFilter = tag;
        }
        currentSearchQuery = ''; // 검색창 초기화
        document.getElementById('searchInput').value = '';
        globalPaginationState.currentPage = 1;
        renderBookmarks();
      });
      tagContainer.appendChild(tagBtn);
    }
  });
}

function renderBookmarks() {
  const container = document.getElementById('bookmarkContainer');
  container.innerHTML = '';
  
  // 전체 북마크 데이터를 필터링
  const filteredBookmarks = bookmarksData.filter(bm => {
    const query = currentSearchQuery.toLowerCase();
    const videoTitle = (bm.videoTitle || bm.title || '').toLowerCase();
    const note = (bm.note || '').toLowerCase();
    const subtitle = (bm.subtitle || '').toLowerCase();
    const tags = (bm.tags || []).map(t => t.toLowerCase());

    const isMatchQuery = query === '' || videoTitle.includes(query) || note.includes(query) || tags.includes(query) || subtitle.includes(query);
    const isMatchTag = currentTagFilter === null || tags.includes(currentTagFilter.toLowerCase());

    return isMatchQuery && isMatchTag;
  });

  // 필터링된 북마크를 기준으로 비디오 그룹핑
  const groupedBookmarks = {};
  filteredBookmarks
    .sort((a, b) => {
      const addedAtA = a.addedAt || 0;
      const addedAtB = b.addedAt || 0;
      return sortOrder === 'desc' ? addedAtB - addedAtA : addedAtA - addedAtB;
    })
    .forEach(bm => {
      const videoId = bm.videoId;
      if (!groupedBookmarks[videoId]) {
        const title = bm.videoTitle || bm.title || `YouTube Video ${videoId}`;
        groupedBookmarks[videoId] = {
          videoId: videoId,
          title: title,
          bookmarks: [],
          tags: bm.tags || []
        };
      }
      groupedBookmarks[videoId].bookmarks.push(bm);
    });

  // 그룹화된 비디오 배열
  const groupedVideoArray = Object.values(groupedBookmarks);

  // 전체 페이지네이션 적용 (비디오 그룹 기준)
  const totalPages = Math.ceil(groupedVideoArray.length / globalPaginationState.pageSize);
  const startIndex = (globalPaginationState.currentPage - 1) * globalPaginationState.pageSize;
  const endIndex = startIndex + globalPaginationState.pageSize;
  const paginatedGroups = groupedVideoArray.slice(startIndex, endIndex);

  paginatedGroups.forEach(group => {
    const videoId = group.videoId;
    if (!videoSortState[videoId]) {
      videoSortState[videoId] = { sortKey: 'addedAt', sortDirection: 'desc' };
    }
    const currentSortState = videoSortState[videoId];

    // 그룹 내 북마크를 그룹별 정렬 키에 따라 정렬
    group.bookmarks.sort((a, b) => {
      const aVal = a[currentSortState.sortKey];
      const bVal = b[currentSortState.sortKey];

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return currentSortState.sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      
      const aNum = Number(aVal) || 0;
      const bNum = Number(bVal) || 0;
      
      return currentSortState.sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
    });

    const videoGroup = document.createElement('div');
    videoGroup.className = 'video-group';

    const header = document.createElement('div');
    header.className = 'video-header';
    
    const titleLink = document.createElement('a');
    titleLink.href = `https://www.youtube.com/watch?v=${group.videoId}`;
    titleLink.className = 'video-title';
    titleLink.textContent = group.title;
    titleLink.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigateToYouTube(group.videoId, 0);
    };
    header.appendChild(titleLink);

    const tagsInput = document.createElement('input');
    tagsInput.type = 'text';
    tagsInput.placeholder = '태그 입력 (쉼표 구분)';
    tagsInput.className = 'tags-input';
    tagsInput.value = group.tags ? group.tags.join(', ') : '';
    
    // 태그 입력 완료시 (Enter) 또는 포커스 잃을 때 저장
    const saveTags = (inputElement) => {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage({
                action: 'updateBookmark',
                // 모든 북마크에 태그를 적용하도록 수정
                id: group.bookmarks[0].id, // 기존 로직 유지
                patch: { tags: inputElement.value.split(',').map(t => t.trim()).filter(Boolean) }
            }, refresh); // 태그 업데이트 후 refresh() 함수 호출
        }
    };
    tagsInput.addEventListener('change', () => saveTags(tagsInput));
    tagsInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            tagsInput.blur();
        }
    });

    header.appendChild(tagsInput);

    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'toggle-icon';
    toggleIcon.textContent = isAllCollapsed ? '►' : '▼';   
    header.appendChild(toggleIcon);
    
    const content = document.createElement('div');
    content.className = 'video-content';
    if (isAllCollapsed) {
        content.classList.add('collapsed');
        toggleIcon.classList.add('collapsed');
    }

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    const headers = [
      { text: '유형컬러', key: null, class: 'col-color' },
      { text: '스크린샷', key: null, class: 'col-screenshot' }, // 스크린샷 헤더 추가
      { text: '추가시간', key: 'addedAt', class: 'col-added' },
      { text: '시간', key: 'time', class: 'col-time' },
      { text: '메모', key: 'note', class: 'col-note' },
      { text: '자막', key: 'subtitle', class: 'col-subtitle' },
      { text: '삭제', key: null, class: 'col-delete' }
    ];

    headers.forEach(h => {
      const th = document.createElement('th');
      th.textContent = h.text;
      if (h.class) {
        th.classList.add(h.class);
      }
      if (h.key) {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
          if (currentSortState.sortKey === h.key) {
            currentSortState.sortDirection = currentSortState.sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            currentSortState.sortKey = h.key;
            currentSortState.sortDirection = 'asc';
            if (h.key === 'addedAt') currentSortState.sortDirection = 'desc';
          }
          renderBookmarks();
        });
        
        const sortIcon = document.createElement('span');
        sortIcon.className = 'sort-icon';
        if (currentSortState.sortKey === h.key) {
          sortIcon.textContent = currentSortState.sortDirection === 'asc' ? '▲' : '▼';
        }
        th.appendChild(sortIcon);
      }
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    group.bookmarks.forEach(bm => {
      const tr = document.createElement('tr');
      
      const colorTd = document.createElement('td');
      colorTd.classList.add('col-color');
      const colorDot = document.createElement('div');
      colorDot.className = 'color-dot';
      colorDot.style.background = bm.color || '#ffd54f';
      colorTd.appendChild(colorDot);
      tr.appendChild(colorTd);
      
      // 스크린샷 셀 추가
      const screenshotTd = document.createElement('td');
      screenshotTd.classList.add('col-screenshot');
      if (bm.imageData) {
        const screenshotImg = document.createElement('img');
        screenshotImg.className = 'screenshot-thumb';
        screenshotImg.src = bm.imageData;
        screenshotImg.alt = '스크린샷';
        screenshotImg.addEventListener('click', () => {
          const modal = document.getElementById('imageModal');
          const modalImg = document.getElementById('modalImage');
          modal.style.display = 'flex';
          modalImg.src = bm.imageData;
        });
        screenshotTd.appendChild(screenshotImg);
      }
      tr.appendChild(screenshotTd);

      const addedTd = document.createElement('td');
      addedTd.classList.add('col-added');
      addedTd.textContent = new Date(bm.addedAt||Date.now()).toLocaleString('ko-KR');
      tr.appendChild(addedTd);

      const timeTd = document.createElement('td');
      timeTd.classList.add('col-time');
      const timeLink = document.createElement('a');
      timeLink.href = `https://www.youtube.com/watch?v=${bm.videoId}&t=${bm.time}s`;
      timeLink.className = 'time-link';
      timeLink.textContent = bm.timeLabel || formatTime(bm.time||0);
      
      timeLink.onclick = (e) => {
        e.preventDefault();
        navigateToYouTube(bm.videoId, bm.time || 0);
      };
      timeTd.appendChild(timeLink);
      tr.appendChild(timeTd);

      const noteTd = document.createElement('td');
      noteTd.classList.add('col-note');
      
      const noteInput = document.createElement('div');
      noteInput.className = 'note-input';
      noteInput.contentEditable = true; // div를 편집 가능하게 설정
      // Newline characters (\n) are correctly converted to <br> tags for proper display
      noteInput.innerHTML = bm.note ? bm.note.replace(/\n/g, '<br>') : '';
      
      noteInput.addEventListener('input', () => {
        const newNote = noteInput.innerText;
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({ 
            action: 'updateBookmark', 
            id: bm.id, 
            patch: { note: newNote } 
          });
        }
      });
      noteInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          noteInput.blur();
        }
      });
      noteInput.addEventListener('blur', () => {
        const newNote = noteInput.innerText;
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({ 
            action: 'updateBookmark', 
            id: bm.id, 
            patch: { note: newNote } 
          });
        }
      });
      noteTd.appendChild(noteInput);
      tr.appendChild(noteTd);

      const subsTd = document.createElement('td');
      subsTd.classList.add('col-subtitle');
      subsTd.textContent = bm.subtitle || '';
      tr.appendChild(subsTd);

      const delTd = document.createElement('td');
      delTd.classList.add('col-delete');
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = '삭제';
      deleteBtn.addEventListener('click', () => {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({ 
            action: 'deleteBookmark', 
            id: bm.id 
          }, refresh);
        }
      });
      delTd.appendChild(deleteBtn);
      tr.appendChild(delTd);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    content.appendChild(table);
    
    header.addEventListener('click', (e) => {
      if (e.target === header || e.target === toggleIcon) {
        content.classList.toggle('collapsed');
        toggleIcon.classList.toggle('collapsed');
        isAllCollapsed = false; // 개별 토글 시 전체 상태 해제
        document.getElementById('toggleAllBtn').textContent = '전체 접기';
      }
    });

    videoGroup.appendChild(header);
    videoGroup.appendChild(content);
    container.appendChild(videoGroup);
  });

  // 전체 페이지네이션 컨트롤 렌더링
  const paginationControls = document.getElementById('globalPaginationControls');
  paginationControls.innerHTML = '';
  
  //const totalPages = Math.ceil(groupedVideoArray.length / globalPaginationState.pageSize);
  
  const pageSizeSelect = document.createElement('select');
  pageSizeSelect.className = 'page-size-select';
  [5, 10, 20, 30].forEach(size => {
    const option = document.createElement('option');
    option.value = size;
    option.textContent = `페이지당 ${size}개`;
    if (size === globalPaginationState.pageSize) {
      option.selected = true;
    }
    pageSizeSelect.appendChild(option);
  });
  pageSizeSelect.addEventListener('change', (e) => {
      globalPaginationState.pageSize = parseInt(e.target.value);
      globalPaginationState.currentPage = 1;
      renderBookmarks();
  });
  paginationControls.appendChild(pageSizeSelect);

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '이전';
  prevBtn.disabled = globalPaginationState.currentPage === 1;
  prevBtn.addEventListener('click', () => {
      globalPaginationState.currentPage--;
      renderBookmarks();
  });
  paginationControls.appendChild(prevBtn);

  const pageInfo = document.createElement('span');
  pageInfo.textContent = ` ${globalPaginationState.currentPage} / ${totalPages} `;
  paginationControls.appendChild(pageInfo);

  const nextBtn = document.createElement('button');
  nextBtn.textContent = '다음';
  nextBtn.disabled = globalPaginationState.currentPage === totalPages;
  nextBtn.addEventListener('click', () => {
      globalPaginationState.currentPage++;
      renderBookmarks();
  });
  paginationControls.appendChild(nextBtn);
}

/**
 * Refreshes the bookmarks data and updates the UI.
 *
 * If running in a Chrome extension environment, requests all bookmarks from the background script
 * and updates the local `bookmarksData` variable with the response. Otherwise, loads a set of
 * sample bookmarks for testing purposes.
 *
 * After updating the bookmarks data, this function calls `renderTags()` to update the tag list
 * and `renderBookmarks()` to display the bookmarks.
 *
 * @function
 * @global
 */
function refresh() {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({ action: 'getAllBookmarks' }, (res) => {
      console.log('Bookmarks response:', res);
      bookmarksData = (res && res.ok && res.data) ? res.data : [];
      renderTags(); // 태그 목록 렌더링
      renderBookmarks();
    });
  } else {
    bookmarksData = [
      { id: '1', videoId: 'dQw4w9WgXcQ', videoTitle: 'Rick Astley - Never Gonna Give You Up (Official Video)', time: 43, timeLabel: '0:43', note: '테스트 메모1', subtitle: 'Never Gonna Give You Up', tags: ['music', 'rickroll'], color: '#ff5722', addedAt: Date.now() - 3600000 },
      { id: '2', videoId: 'dQw4w9WgXcQ', videoTitle: 'Rick Astley - Never Gonna Give You Up (Official Video)', time: 120, timeLabel: '2:00', note: '다른 메모2\n(줄바꿈 테스트)', subtitle: 'A different part of the song', tags: ['music', 'lyrics'], color: '#2196f3', addedAt: Date.now() - 1800000 },
      { id: '3', videoId: 'dQw4w9WgXcQ', videoTitle: 'Rick Astley - Never Gonna Give You Up (Official Video)', time: 60, timeLabel: '1:00', note: '메모3', subtitle: 'Third part of the video', tags: ['history', 'old'], color: '#4caf50', addedAt: Date.now() - 900000 },
      { id: '4', videoId: 'dQw4w9WgXcQ', videoTitle: 'Rick Astley - Never Gonna Give You Up (Official Video)', time: 180, timeLabel: '3:00', note: '메모4', subtitle: 'End of the song', tags: ['history', 'old'], color: '#9c27b0', addedAt: Date.now() - 600000 },
      { id: '5', videoId: 'dQw4w9WgXcQ', videoTitle: 'Rick Astley - Never Gonna Give You Up (Official Video)', time: 240, timeLabel: '4:00', note: '메모5', subtitle: 'Last bookmark', tags: ['history', 'old'], color: '#009688', addedAt: Date.now() - 300000, imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' }, // dummy image data
      { id: '6', videoId: 'dQw4w9WgXcQ', videoTitle: 'Rick Astley - Never Gonna Give You Up (Official Video)', time: 300, timeLabel: '5:00', note: '메모6', subtitle: 'New bookmark', tags: ['history', 'old'], color: '#ffc107', addedAt: Date.now(), imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' }, // dummy image data
      { id: '7', videoId: 'jNQXAC9IVRw', videoTitle: 'Me at the zoo', time: 60, timeLabel: '1:00', note: '세번째 메모', subtitle: 'I have an elephant here', tags: ['history', 'old'], color: '#4caf50', addedAt: Date.now() - 900000 },
      { id: '8', videoId: 'jNQXAC9IVRw', videoTitle: 'Me at the zoo', time: 90, timeLabel: '1:30', note: '다른 동물', subtitle: 'Another animal in the zoo', tags: ['history', 'old'], color: '#03a9f4', addedAt: Date.now() - 700000 },
      { id: '9', videoId: 'xyz123abc', videoTitle: 'Coding Tutorial', time: 150, timeLabel: '2:30', note: '중요한 코드', subtitle: 'This is a crucial part', tags: ['code', 'tutorial'], color: '#e91e63', addedAt: Date.now() - 1000000 },
      { id: '10', videoId: 'xyz123abc', videoTitle: 'Coding Tutorial', time: 300, timeLabel: '5:00', note: '마무리', subtitle: 'End of the lesson', tags: ['code', 'tutorial'], color: '#673ab7', addedAt: Date.now() - 500000 },
      { id: '11', videoId: 'pqr456def', videoTitle: 'Travel Vlog', time: 100, timeLabel: '1:40', note: '풍경이 멋짐', subtitle: 'Beautiful scenery', tags: ['travel', 'vlog'], color: '#ffeb3b', addedAt: Date.now() - 200000 },
      { id: '12', videoId: 'pqr456def', videoTitle: 'Travel Vlog', time: 200, timeLabel: '3:20', note: '다른 풍경', subtitle: 'Another scenery', tags: ['travel', 'vlog'], color: '#ffeb3b', addedAt: Date.now() - 150000 }
    ];
    renderTags(); // 테스트 데이터로 태그 렌더링
    renderBookmarks();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  refresh();
  
  const searchInput = document.getElementById('searchInput');
  if(searchInput){
    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value;
      currentTagFilter = null; // 검색 입력 시 태그 필터 초기화
      globalPaginationState.currentPage = 1;
      renderBookmarks();
      renderTags();
    });
  }

  const sortBtn = document.getElementById('sortBtn');
  if(sortBtn){
    sortBtn.addEventListener('click', () => {
      if (sortOrder === 'desc') {
        sortOrder = 'asc';
        sortBtn.textContent = '오래된순 ▲';
      } else {
        sortOrder = 'desc';
        sortBtn.textContent = '최신순 ▼';
      }
      globalPaginationState.currentPage = 1;
      renderBookmarks();
    });
  }

  const toggleAllBtn = document.getElementById('toggleAllBtn');
  if (toggleAllBtn) {
    toggleAllBtn.addEventListener('click', () => {
      isAllCollapsed = !isAllCollapsed;
      toggleAllBtn.textContent = isAllCollapsed ? '전체 펼치기' : '전체 접기';
      renderBookmarks();
    });
  }

  // 모달 닫기 기능
  const modal = document.getElementById('imageModal');
  const closeModal = document.getElementsByClassName('close')[0];
  closeModal.onclick = () => { 
    modal.style.display = 'none';
  };
  window.onclick = (event) => {
    if (event.target == modal) {
      modal.style.display = 'none';
    }
  };
});