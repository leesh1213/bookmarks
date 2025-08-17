// content.js - capture YouTube bookmarks and send to background (IndexedDB lives in background)
(function () {
  // Helpers
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function getVideoId() {
    const url = new URL(location.href);
    return url.searchParams.get('v');
  }

  function getCurrentTime() {
    const video = document.querySelector('video');
    return video ? Math.floor(video.currentTime) : 0;
  }

  function getVisibleSubtitle() {
    // Try Language Reactor (#lln-subs / .lln-sentence-wrap)
    const lln = document.querySelector('.lln-sentence-wrap, #lln-subs');
    if (lln && lln.innerText) return lln.innerText.trim();
    // Try YouTube's native captions (live text)
    const yts = document.querySelector('.ytp-caption-segment');
    if (yts && yts.innerText) return yts.innerText.trim();
    return '';
  }

 function showToast(message) {
  // 기존 토스트 제거
  const oldToast = document.getElementById("custom-toast");
  if (oldToast) oldToast.remove();

  // 토스트 생성
  const toast = document.createElement("div");
  toast.id = "custom-toast";
  toast.textContent = message;
  toast.style.position = "absolute";
  toast.style.zIndex = "9999";
  toast.style.padding = "8px 16px";
  toast.style.background = "rgba(0,0,0,0.7)";
  toast.style.color = "#fff";
  toast.style.borderRadius = "8px";
  toast.style.fontSize = "14px";
  toast.style.textAlign = "center";
  toast.style.pointerEvents = "none";
  toast.style.transition = "opacity 0.5s ease";

  // 영상 영역 기준 위치 계산
  const player = document.querySelector("#movie_player video") || document.querySelector("video");
  if (player) {
    const rect = player.getBoundingClientRect();

    // 가로 중앙, 세로 중앙보다 약간 위 (20% 위)
    const top = rect.top + rect.height * 0.4;  // 중앙보다 위
    const left = rect.left + rect.width / 2;

    toast.style.top = `${top}px`;
    toast.style.left = `${left}px`;
    toast.style.transform = "translate(-50%, -50%)";
  } else {
    // fallback: 화면 중앙
    toast.style.top = "40%";
    toast.style.left = "50%";
    toast.style.transform = "translate(-50%, -50%)";
  }

  document.body.appendChild(toast);

  // 자동 제거
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 500);
  }, 2000);
}

  // 스크린샷 캡쳐 함수 (자막 영역 포함)
  function captureVideoScreenshot() {
      const video = document.querySelector('video');
      const subtitles = getVisibleSubtitle();
      
      if (!video) return null;

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      
      // 비디오를 캔버스에 그립니다.
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // 자막을 캔버스에 그립니다.
      if (subtitles) {
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(0, canvas.height - 50, canvas.width, 50);
        context.font = '24px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(subtitles, canvas.width / 2, canvas.height - 25);
      }

      return canvas.toDataURL('image/webp', 0.8);
  }

  function addBookmark(color = 'yellow', note = '', imageData = null) {
    const videoId = getVideoId();
    if (!videoId) return;
    const time = getCurrentTime();
    const subtitle = getVisibleSubtitle();
    const title = document.title || ''; // 유튜브 제목 추가
    const data = {
      videoId,
      videoTitle: title,
      time,
      timeLabel: formatTime(time),
      note,
      subtitle,
      color,
      addedAt: Date.now()
    };
    
    // 이미지 데이터가 있을 경우 추가
    if (imageData) {
        data.imageData = imageData;
    }

    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: 'addBookmark', data });
      console.log('북마크 추가:', data);
      showToast('북마크 저장됨');
      // 북마크가 추가된 후 마커를 업데이트합니다.
        addBookmarkMarkers();
    }
  }

   //북마크 마커를 타임라인에 추가하는 함수
  function addBookmarkMarkers() {
    const videoId = getVideoId();
    if (!videoId) return;

    // 기존 마커를 모두 제거합니다.
    document.querySelectorAll('.yt-bookmark-marker').forEach(el => el.remove());

    // 백그라운드 스크립트로부터 현재 비디오의 북마크 목록을 요청합니다.
    chrome.runtime.sendMessage({ action: 'getAllBookmarks', videoId }, (res) => {
      if (res?.data && res.data.length > 0) {
        const video = document.querySelector('video');
        if (!video) return;

        const timeline = document.querySelector('.ytp-progress-bar');
        const duration = video.duration;

        if (timeline && duration) {
          res.data.forEach(bookmark => {
            const marker = document.createElement('div');
            const timePercent = (bookmark.time / duration) * 100;
            marker.className = 'yt-bookmark-marker';
            
            // 마커 스타일을 삼각형 모양으로 변경하고 타임라인 아래에 위치시킵니다.
            marker.style.cssText = `
              position: absolute;
              left: ${timePercent}%;
              top: 100%; /* 타임라인 아래에 위치 */
              width: 0;
              height: 0;
              border-left: 10px solid transparent; /* 좌측 경계선 */
              border-right: 10px solid transparent; /* 우측 경계선 */
              border-bottom: 20px solid ${bookmark.color}; /* 상단 경계선 (삼각형 모양) */
              z-index: 9999;
              transform: translateX(-50%); /* 정확한 위치 조정을 위해 중앙 정렬 */
              cursor: pointer; /* 클릭 가능한 모양으로 변경 */
            `;

            // 북마크로 이동하는 이벤트 리스너를 추가합니다.
            marker.addEventListener('click', () => {
              const video = document.querySelector('video');
              if (video) {
                video.currentTime = bookmark.time;
                video.play();
              }
            });

            timeline.appendChild(marker);
          });
        }
      }
    });
  }


  // Key bindings: v (yellow), b (blue), n (purple), p (screenshot)
  document.addEventListener('keydown', (e) => {
    if (['INPUT','TEXTAREA'].includes((e.target.tagName||'').toUpperCase())) return;
    if (e.key === 'v') addBookmark('yellow', '');
    else if (e.key === 'b') addBookmark('blue', '');
    else if (e.key === 'n') addBookmark('purple', '');
    else if (e.key === 'p') {
      const imageData = captureVideoScreenshot();
      if (imageData) {
          addBookmark('#D32F2F', '', imageData);
      }
    }
  });

  // 페이지가 업데이트될 때마다 마커를 추가합니다.
  window.addEventListener('yt-page-data-updated', () => {
    setTimeout(addBookmarkMarkers, 1000); // 플레이어가 로드될 시간을 줍니다.
  });

  // 초기 로드 시 마커를 추가합니다.
  addBookmarkMarkers();

})();

// `bookmarks.js`에서 보내는 메시지를 수신하는 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'navigateToBookmark') {
    const time = message.time;
    // 비디오가 로드될 때까지 기다리는 함수
    const waitForVideo = (t) => {
      const video = document.querySelector('video');
      if (video) {
        video.currentTime = t;
        video.play();
      } else {
        setTimeout(() => waitForVideo(t), 100);
      }
    };
    waitForVideo(time);
  }
});