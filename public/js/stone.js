        const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
        const t = (zh, en) => (lang === 'zh' ? zh : en);
        const translateServerMessage = window.translateServerMessage || ((message) => message);
        const csrfToken = document.body.dataset.csrfToken || '';
        const colors = {
            red: 'stone-red',
            orange: 'stone-orange',
            yellow: 'stone-yellow',
            green: 'stone-green',
            cyan: 'stone-cyan',
            blue: 'stone-blue',
            purple: 'stone-purple'
        };

        let selectedSlot = null;
        let currentState = null;

        function updateBalance(balance) {
            if (typeof balance === 'number') {
                document.getElementById('current-balance').textContent = balance;
            }
        }

        function renderSlots(slots, highlightIndex = null) {
            slots.forEach((color, index) => {
                const slot = document.querySelector(`.stone-slot[data-index="${index}"]`);
                slot.className = 'stone-slot';
                slot.classList.remove('selected');
                if (!color) {
                    slot.classList.add('empty');
                    slot.textContent = '+';
                } else {
                    slot.classList.add(colors[color] || '');
                    slot.textContent = '';
                }
                if (highlightIndex === index) {
                    slot.classList.add('swap-animate');
                }
            });
        }

        function updateUI(state, highlightIndex = null) {
            currentState = state;
            renderSlots(state.slots, highlightIndex);

            const isFull = state.isFull;
            const maxSame = state.maxSame || 0;
            const reward = state.reward || 0;

            document.getElementById('rewardAmount').textContent = isFull ? `${reward} ${t('电币', 'coins')}` : '--';
            document.getElementById('sameCount').textContent = t(`同色 ${maxSame}`, `Same Color ${maxSame}`);
            const redeemBtn = document.getElementById('redeemBtn');
            redeemBtn.disabled = !isFull;
            redeemBtn.classList.toggle('ready', !redeemBtn.disabled);

            const addOneBtn = document.getElementById('addOneBtn');
            addOneBtn.disabled = isFull;
            addOneBtn.classList.toggle('ready', !addOneBtn.disabled);

            const fillBtn = document.getElementById('fillBtn');
            fillBtn.disabled = state.slots.some(slot => slot);
            fillBtn.classList.toggle('ready', !fillBtn.disabled);

            const replaceCost = state.replaceCost;
            document.getElementById('replaceCost').textContent = replaceCost ? `${replaceCost} ${t('电币', 'coins')}` : t('不可更换', 'Not Available');

            if (!state.canReplace) {
                selectedSlot = null;
                document.getElementById('selectedSlot').textContent = '-';
                document.querySelectorAll('.stone-slot').forEach((item) => item.classList.remove('selected'));
            }

            const replaceBtn = document.getElementById('replaceBtn');
            replaceBtn.disabled = !(state.canReplace && selectedSlot !== null);
            replaceBtn.classList.toggle('ready', !replaceBtn.disabled);
        }

        async function loadState(highlightIndex = null) {
            const response = await fetch('/api/stone/state');
            const data = await response.json();
            if (data.success) {
                updateUI(data, highlightIndex);
            }
        }

        async function postAction(url, body = {}) {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify(body)
            });
            const result = await response.json();
            if (!result.success) {
                alert(translateServerMessage(result.message) || t('操作失败', 'Action failed'));
                return null;
            }
            updateBalance(result.newBalance);
            await loadState(result.replacedSlot ?? null);
            return result;
        }

        document.getElementById('addOneBtn').addEventListener('click', () => {
            postAction('/api/stone/add');
        });

        document.getElementById('fillBtn').addEventListener('click', () => {
            postAction('/api/stone/fill');
        });

        document.getElementById('replaceBtn').addEventListener('click', () => {
            if (selectedSlot === null) {
                alert(t('请选择一个槽位', 'Please select a slot'));
                return;
            }
            postAction('/api/stone/replace', { index: selectedSlot });
        });

        document.getElementById('redeemBtn').addEventListener('click', async () => {
            const result = await postAction('/api/stone/redeem');
            if (result && result.reward !== undefined) {
                alert(t(
                    `兑换成功！获得 ${result.reward} 电币`,
                    `Redeem success! Earned ${result.reward} coins`
                ));
            }
        });

        document.querySelectorAll('.stone-slot').forEach((slot) => {
            slot.addEventListener('click', () => {
                if (!currentState || !currentState.isFull) {
                    return;
                }
                document.querySelectorAll('.stone-slot').forEach((item) => item.classList.remove('selected'));
                slot.classList.add('selected');
                selectedSlot = Number(slot.dataset.index);
                document.getElementById('selectedSlot').textContent = selectedSlot + 1;
                const replaceBtn = document.getElementById('replaceBtn');
                replaceBtn.disabled = !(currentState.canReplace && selectedSlot !== null);
                replaceBtn.classList.toggle('ready', !replaceBtn.disabled);
            });
        });

        loadState();
    
