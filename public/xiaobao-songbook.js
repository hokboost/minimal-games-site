(() => {
  'use strict';

  const searchInput = document.querySelector('#song-search');
  const clearSearch = document.querySelector('#clear-search');
  const showAllSongs = document.querySelector('#show-all-songs');
  const resultCount = document.querySelector('#result-count');
  const emptyState = document.querySelector('#empty-state');
  const tabs = [...document.querySelectorAll('[data-category]')];
  const groups = [...document.querySelectorAll('[data-song-group]')];
  const cards = [...document.querySelectorAll('[data-song-name]')];
  const dialogBackdrop = document.querySelector('#copy-dialog-backdrop');
  const dialogClose = document.querySelector('#copy-dialog-close');
  const dialogAction = document.querySelector('#copy-dialog-action');
  const manualCopyValue = document.querySelector('#manual-copy-value');
  const toast = document.querySelector('#copy-toast');
  const toastMessage = document.querySelector('#copy-toast-message');

  let activeCategory = '全部';
  let toastTimer;
  let copiedTimer;

  const normalize = (value) => value.trim().toLocaleLowerCase('zh-CN');

  const filterSongs = () => {
    const query = normalize(searchInput.value);
    let visibleTotal = 0;

    groups.forEach((group) => {
      const categoryMatches = activeCategory === '全部' || group.dataset.songGroup === activeCategory;
      let visibleInGroup = 0;

      group.querySelectorAll('[data-song-name]').forEach((card) => {
        const matches = categoryMatches && normalize(card.dataset.songName).includes(query);
        card.hidden = !matches;
        if (matches) visibleInGroup += 1;
      });

      group.hidden = visibleInGroup === 0;
      const count = group.querySelector('[data-visible-count]');
      if (count) count.textContent = String(visibleInGroup);
      visibleTotal += visibleInGroup;
    });

    clearSearch.hidden = query.length === 0;
    emptyState.hidden = visibleTotal !== 0;
    resultCount.textContent = query
      ? `找到 ${visibleTotal} 首与“${searchInput.value.trim()}”相关的歌`
      : `当前显示 ${visibleTotal} 首歌`;
  };

  const setCategory = (category) => {
    activeCategory = category;
    tabs.forEach((tab) => {
      const active = tab.dataset.category === category;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
    filterSongs();
  };

  const showToast = (message, isError = false) => {
    clearTimeout(toastTimer);
    toastMessage.textContent = message;
    toast.classList.toggle('is-error', isError);
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => { toast.hidden = true; }, 220);
    }, 2200);
  };

  const legacyCopy = (text) => {
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    input.setSelectionRange(0, input.value.length);
    const copied = document.execCommand('copy');
    input.remove();
    return copied;
  };

  const copyText = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    if (!legacyCopy(text)) throw new Error('copy-failed');
  };

  const openManualDialog = (text) => {
    manualCopyValue.value = text;
    dialogBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => {
      manualCopyValue.focus();
      manualCopyValue.select();
    }, 0);
  };

  const closeManualDialog = () => {
    dialogBackdrop.hidden = true;
    document.body.style.overflow = '';
  };

  const markCopied = (card) => {
    clearTimeout(copiedTimer);
    cards.forEach((item) => {
      item.classList.remove('is-copied');
      item.querySelector('.copy-hint').textContent = '点歌';
    });
    card.classList.add('is-copied');
    card.querySelector('.copy-hint').textContent = '已复制';
    copiedTimer = window.setTimeout(() => {
      card.classList.remove('is-copied');
      card.querySelector('.copy-hint').textContent = '点歌';
    }, 1600);
  };

  searchInput.addEventListener('input', filterSongs);
  clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    searchInput.focus();
    filterSongs();
  });
  showAllSongs.addEventListener('click', () => {
    searchInput.value = '';
    setCategory('全部');
    searchInput.focus();
  });
  tabs.forEach((tab) => tab.addEventListener('click', () => setCategory(tab.dataset.category)));

  cards.forEach((card) => {
    card.addEventListener('click', async () => {
      const text = `点歌 ${card.dataset.songName}`;
      try {
        await copyText(text);
        markCopied(card);
        showToast(`已复制：${text}`);
      } catch (_error) {
        openManualDialog(text);
        showToast('自动复制被拦截，请手动复制', true);
      }
    });
  });

  dialogClose.addEventListener('click', closeManualDialog);
  dialogBackdrop.addEventListener('click', (event) => {
    if (event.target === dialogBackdrop) closeManualDialog();
  });
  dialogAction.addEventListener('click', async () => {
    try {
      await copyText(manualCopyValue.value);
      closeManualDialog();
      showToast(`已复制：${manualCopyValue.value}`);
    } catch (_error) {
      manualCopyValue.focus();
      manualCopyValue.select();
      showToast('请按 Ctrl+C 或长按复制', true);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !dialogBackdrop.hidden) closeManualDialog();
  });
})();
