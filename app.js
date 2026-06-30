/* ==========================================================================
   HEARTSPACE CORE APPLICATION LOGIC (FIREBASE SYNC WITH LOCAL STORAGE FALLBACK)
   ========================================================================== */

// --- 1. FIREBASE CONFIGURATION & INITIALIZATION ---

// Placeholder Firebase Configuration. Replace with your actual Firebase project settings.
const firebaseConfig = {
    databaseURL: "https://gemini-antigravity-default-rtdb.firebaseio.com"
};

let db = null;
let firebaseActive = false;

try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    firebaseActive = true;
} catch (e) {
    console.warn("Firebase failed to initialize. Falling back to local storage mode.", e);
}

// --- 2. GLOBAL STATE ---

let state = {
    currentUser: null,       // Loaded from LocalStorage: { name, groupCode, lineId, igUsername, mood }
    groupCode: null,         // Active friendship space identifier
    posts: [],               // Synced posts (hybrid)
    friends: {},             // Synced users (hybrid)
    isFirebaseConnected: false
};

const MOODS = {
    happy: { label: '活力充沛', emoji: '✨', color: '#ffd166', status: '正能量滿滿，今天效率超高！' },
    relaxed: { label: '慵懶放鬆', emoji: '☕', color: '#83c5be', status: '泡杯熱茶，看著窗外發呆。' },
    tired: { label: '疲憊想睡', emoji: '😴', color: '#a78bfa', status: '腦袋空空的，好想立刻躺平。' },
    busy: { label: '瘋狂忙碌', emoji: '🔥', color: '#f28482', status: '被死線追趕，暫時無法分神...' },
    emo: { label: '心碎沮喪', emoji: '🌧️', color: '#90e0ef', status: '需要一點溫暖，今天有點小 emo。' }
};

// Prepopulated Default Posts for offline fallback
const DEFAULT_POSTS = [
    {
        id: 'post_1',
        authorName: 'Yuki',
        type: 'photo',
        content: '忙裡偷閒！這家巷弄裡的咖啡館特別安靜，肉桂捲超級美味。點了一杯卡布奇諾，看完了半本書。送一隻雲端肉桂捲給你們 🥐☕',
        mediaData: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&auto=format&fit=crop&q=80',
        timestamp: '今天 14:32',
        mood: 'relaxed',
        reactions: { love: { 'Alan': true, '我': true } },
        comments: {
            'c1': { authorName: 'Alan', text: '天哪！肉桂捲看起來太犯規了，求店名！', timestamp: '14:40' }
        }
    },
    {
        id: 'post_2',
        authorName: 'Alan',
        type: 'voice',
        content: '給大家聽聽我這邊窗外的雨聲，伴隨著鍵盤聲，還蠻舒壓的。希望大家今天一切順利，加油啦！',
        mediaData: 'MOCK_AUDIO_ALAN', 
        timestamp: '今天 12:15',
        mood: 'tired',
        reactions: { support: { '我': true } },
        comments: {}
    }
];

// --- 3. ONBOARDING & INITIALIZATION ---

function initApp() {
    setupDateTime();
    setInterval(setupDateTime, 60000);
    
    // Check if user has an existing profile
    const savedProfile = localStorage.getItem('heartspace_user_profile');
    
    // Check url for invite parameters
    const urlParams = new URLSearchParams(window.location.search);
    const inviteCode = urlParams.get('invite');
    
    if (savedProfile) {
        state.currentUser = JSON.parse(savedProfile);
        state.groupCode = state.currentUser.groupCode;
        
        // If invite parameters are different, prompt update
        if (inviteCode && inviteCode !== state.groupCode) {
            if (confirm(`偵測到新的邀請連結！要從目前的群組「${state.groupCode}」切換至「${inviteCode}」嗎？`)) {
                state.currentUser.groupCode = inviteCode;
                state.groupCode = inviteCode;
                localStorage.setItem('heartspace_user_profile', JSON.stringify(state.currentUser));
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }
        
        loadLocalCache();
        connectToFirebase();
        setupEventListeners();
    } else {
        const onboardModal = document.getElementById('onboard-modal');
        onboardModal.classList.remove('hidden');
        
        if (inviteCode) {
            document.getElementById('onboard-invite').value = inviteCode;
        }
        
        setupOnboardingListeners();
    }
}

function loadLocalCache() {
    const savedPosts = localStorage.getItem(`heartspace_posts_${state.groupCode}`);
    const savedFriends = localStorage.getItem(`heartspace_friends_${state.groupCode}`);
    
    if (savedPosts) {
        state.posts = JSON.parse(savedPosts);
    } else {
        state.posts = [...DEFAULT_POSTS];
    }
    
    if (savedFriends) {
        state.friends = JSON.parse(savedFriends);
    }
    
    updateProfileUI();
    renderFriendsList();
    renderFeed('all');
}

function saveLocalCache() {
    localStorage.setItem(`heartspace_posts_${state.groupCode}`, JSON.stringify(state.posts));
    localStorage.setItem(`heartspace_friends_${state.groupCode}`, JSON.stringify(state.friends));
}

// Setup onboarding listeners
function setupOnboardingListeners() {
    const startBtn = document.getElementById('start-onboard-btn');
    startBtn.onclick = () => {
        const nameInput = document.getElementById('onboard-name').value.trim();
        const inviteInput = document.getElementById('onboard-invite').value.trim().toUpperCase();
        const lineInput = document.getElementById('onboard-line').value.trim();
        const igInput = document.getElementById('onboard-ig').value.trim();
        
        if (!nameInput || !inviteInput) {
            alert('請填寫名字與邀請代碼！');
            return;
        }
        
        state.currentUser = {
            name: nameInput,
            groupCode: inviteInput,
            lineId: lineInput,
            igUsername: igInput,
            mood: 'relaxed'
        };
        state.groupCode = inviteInput;
        
        localStorage.setItem('heartspace_user_profile', JSON.stringify(state.currentUser));
        document.getElementById('onboard-modal').classList.add('hidden');
        
        loadLocalCache();
        connectToFirebase();
        setupEventListeners();
        
        window.history.replaceState({}, document.title, window.location.pathname);
    };
}

// --- 4. FIREBASE CONNECTIVITY & HYBRID FALLBACK ---

let connectionWatchdog = null;

function connectToFirebase() {
    document.getElementById('active-space-name').textContent = `空間: ${state.groupCode}`;
    
    if (!firebaseActive || !db) {
        updateOfflineUI();
        return;
    }
    
    // Set a watchdog timer (2.5s) to detect connection failure / invalid database URL
    connectionWatchdog = setTimeout(() => {
        if (!state.isFirebaseConnected) {
            console.warn("Firebase connection timeout. Staying in offline-cache mode.");
            updateOfflineUI();
        }
    }, 2500);
    
    // Watch connection status
    db.ref(".info/connected").on("value", (snap) => {
        if (snap.val() === true) {
            state.isFirebaseConnected = true;
            clearTimeout(connectionWatchdog);
            document.getElementById('active-space-name').innerHTML = `<i class="fa-solid fa-cloud" style="color:var(--color-mood-relaxed)"></i> 雲端空間: ${state.groupCode}`;
            
            // Sync user profile
            syncUserProfileToCloud();
            // Watch for kick
            watchKickStatus();
            // Start listening to live feed
            listenToCloudData();
        } else {
            state.isFirebaseConnected = false;
            // Don't trigger offline UI immediately, wait for watchdog if initial
        }
    });
}

function watchKickStatus() {
    if (state.isFirebaseConnected && db && state.currentUser) {
        db.ref(`groups/${state.groupCode}/users/${state.currentUser.name}`).on('value', (snapshot) => {
            if (state.isFirebaseConnected && !snapshot.exists()) {
                handleKicked();
            }
        });
    }
}

function handleKicked() {
    alert("您已被房主或成員移出該群組空間！網頁將重新導向回個人設定頁面。");
    localStorage.removeItem('heartspace_user_profile');
    window.location.href = window.location.origin + window.location.pathname;
}

function updateOfflineUI() {
    document.getElementById('active-space-name').innerHTML = `<i class="fa-solid fa-cloud-slash" style="color:var(--color-mood-tired)"></i> 本地空間: ${state.groupCode}`;
    
    // Pre-populate mock friends in local radar if empty to make it look active
    if (Object.keys(state.friends).length === 0) {
        state.friends = {
            'Yuki': { name: 'Yuki', mood: 'relaxed', status: '在咖啡廳躲雨 ☕', lastActive: Date.now() - 300000, lineId: 'yuki_line', igUsername: 'yuki_ig' },
            'Alan': { name: 'Alan', mood: 'tired', status: '加班除錯中... 💻', lastActive: Date.now() - 3600000, lineId: 'alan_line', igUsername: 'alan_ig' }
        };
        saveLocalCache();
        renderFriendsList();
    }
}

function syncUserProfileToCloud() {
    const userRef = db.ref(`groups/${state.groupCode}/users/${state.currentUser.name}`);
    userRef.set({
        name: state.currentUser.name,
        lineId: state.currentUser.lineId || '',
        igUsername: state.currentUser.igUsername || '',
        mood: state.currentUser.mood,
        lastActive: Date.now()
    });
    
    userRef.onDisconnect().update({
        lastActive: firebase.database.ServerValue.TIMESTAMP
    });
}

function listenToCloudData() {
    // Sync Posts
    db.ref(`groups/${state.groupCode}/posts`).on('value', (snapshot) => {
        const data = snapshot.val();
        state.posts = [];
        if (data) {
            Object.keys(data).forEach(key => {
                state.posts.push({
                    id: key,
                    ...data[key]
                });
            });
            state.posts.sort((a, b) => b.createdAt - a.createdAt);
        } else {
            state.posts = [...DEFAULT_POSTS];
        }
        saveLocalCache();
        renderFeed(document.querySelector('.filter-btn.active').dataset.filter);
    });
    
    // Sync Users
    db.ref(`groups/${state.groupCode}/users`).on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            state.friends = data;
            saveLocalCache();
            updateProfileUI();
            renderFriendsList();
        }
    });
}

// --- 5. UI UPDATING FUNCTIONS ---

function setupDateTime() {
    const timeSpan = document.getElementById('current-time');
    const greetingSpan = document.getElementById('greeting-text');
    
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    timeSpan.textContent = `${hours}:${minutes}`;
    
    let greeting = '';
    const hr = now.getHours();
    if (hr >= 5 && hr < 11) {
        greeting = '☀️ 晨光熹微，新的一天開始囉！';
    } else if (hr >= 11 && hr < 14) {
        greeting = '🍱 午餐時間，記得喝杯咖啡休息一下。';
    } else if (hr >= 14 && hr < 18) {
        greeting = '☕ 午後微光，伸個懶腰再出發。';
    } else if (hr >= 18 && hr < 22) {
        greeting = '🌆 下班囉，好好的享受溫馨夜晚吧。';
    } else {
        greeting = '🌙 深夜了，今天辛苦囉，聽首語音悄悄話吧。';
    }
    greetingSpan.textContent = greeting;
}

function updateProfileUI() {
    if (!state.currentUser) return;
    
    const avatar = document.getElementById('my-avatar');
    const nameEl = document.getElementById('my-profile-name');
    const glow = document.getElementById('my-mood-glow');
    const subEl = document.getElementById('my-profile-sub');
    
    avatar.textContent = state.currentUser.name.charAt(0).toUpperCase();
    avatar.style.background = `linear-gradient(135deg, #a78bfa, #3f3f46)`;
    nameEl.textContent = state.currentUser.name;
    subEl.textContent = `@${state.groupCode} 空間房主`;
    
    const currentMood = state.currentUser.mood;
    const moodColor = MOODS[currentMood]?.color || '#83c5be';
    glow.style.backgroundColor = moodColor;
    glow.style.boxShadow = `0 0 20px ${moodColor}`;
    
    document.querySelectorAll('.mood-btn').forEach(btn => {
        if (btn.dataset.mood === currentMood) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function renderFriendsList() {
    const listEl = document.getElementById('friends-list');
    listEl.innerHTML = '';
    
    const friendKeys = Object.keys(state.friends).filter(name => name !== state.currentUser.name);
    
    document.getElementById('friends-count').textContent = friendKeys.length + 1;
    
    if (friendKeys.length === 0) {
        listEl.innerHTML = `
            <div style="text-align: center; padding: 20px; font-size: 11.5px; color: var(--color-text-secondary);">
                目前沒有好友在空間中。點擊下方按鈕，複製邀請連結傳給摯友吧！
            </div>
        `;
        return;
    }
    
    friendKeys.forEach(friendName => {
        const friend = state.friends[friendName];
        const moodObj = MOODS[friend.mood] || { label: '平靜', emoji: '☕', color: '#83c5be', status: '放鬆休息中' };
        
        let activeStatusText = '離線';
        const isOnline = (Date.now() - friend.lastActive) < 120000;
        
        if (isOnline) {
            activeStatusText = friend.status || moodObj.status || '線上活躍中';
        } else {
            const diffMin = Math.floor((Date.now() - friend.lastActive) / 60000);
            if (diffMin < 60) {
                activeStatusText = `${diffMin} 分鐘前在線上`;
            } else {
                const diffHr = Math.floor(diffMin / 60);
                activeStatusText = diffHr < 24 ? `${diffHr} 小時前在線上` : `${Math.floor(diffHr/24)} 天前在線上`;
            }
        }
        
        const lineHref = friend.lineId ? `https://line.me/ti/p/~${friend.lineId}` : '#';
        const igHref = friend.igUsername ? `https://instagram.com/_u/${friend.igUsername}/` : '#';
        
        const lineClass = friend.lineId ? '' : 'hidden';
        const igClass = friend.igUsername ? '' : 'hidden';
        
        const itemHtml = `
            <div class="friend-item">
                <div class="friend-profile-info">
                    <div class="friend-avatar-container">
                        <div class="friend-avatar" style="background: linear-gradient(135deg, #a78bfa, #27272a)">${friendName.charAt(0).toUpperCase()}</div>
                        <div class="mood-glow" style="background-color: ${moodObj.color}; box-shadow: 0 0 10px ${moodObj.color};"></div>
                    </div>
                    <div class="friend-details">
                        <span class="friend-name">${friendName} <span style="font-size:11px" title="${moodObj.label}">${moodObj.emoji}</span></span>
                        <span class="friend-status" title="${activeStatusText}">${activeStatusText}</span>
                    </div>
                </div>
                <div class="friend-social-links" style="display: flex; align-items: center; gap: 8px;">
                    <a href="${lineHref}" target="_blank" class="friend-social-icon ${lineClass}" title="在 LINE 傳送悄悄話"><i class="fa-brands fa-line"></i></a>
                    <a href="${igHref}" target="_blank" class="friend-social-icon ${igClass}" title="查看 Instagram"><i class="fa-brands fa-instagram"></i></a>
                    <i class="fa-solid fa-trash-can remove-friend-btn" onclick="removeFriend('${friendName}')" title="將該成員移出空間"></i>
                </div>
            </div>
        `;
        listEl.insertAdjacentHTML('beforeend', itemHtml);
    });
}

function renderFeed(filter = 'all') {
    const feedEl = document.getElementById('posts-feed');
    feedEl.innerHTML = '';
    
    const filteredPosts = state.posts.filter(post => {
        if (filter === 'all') return true;
        return post.type === filter;
    });
    
    if (filteredPosts.length === 0) {
        feedEl.innerHTML = `
            <div class="glass-card post-card" style="text-align: center; padding: 40px; color: var(--color-text-secondary);">
                <i class="fa-solid fa-heart-crack" style="font-size: 28px; margin-bottom: 12px; color: var(--color-mood-tired)"></i>
                <p>該類型目前沒有貼文，分享一則溫暖的近況吧！</p>
            </div>
        `;
        return;
    }
    
    filteredPosts.forEach(post => {
        const moodObj = MOODS[post.mood] || { label: '平靜', emoji: '☕', color: '#83c5be' };
        
        let mediaHtml = '';
        if (post.type === 'photo' && post.mediaData) {
            mediaHtml = `
                <div class="polaroid-container" onclick="openLightbox('${post.mediaData}', '${escapeHtml(post.content)}')">
                    <img src="${post.mediaData}" class="polaroid-img" alt="生活瞬間">
                    <div class="polaroid-caption">${post.authorName} · ${moodObj.emoji} ${moodObj.label}</div>
                </div>
            `;
        } else if (post.type === 'voice' && post.mediaData) {
            mediaHtml = `
                <div class="voice-player" id="voice-player-${post.id}">
                    <button class="voice-play-btn" onclick="togglePlayVoice('${post.id}', '${post.mediaData}')">
                        <i class="fa-solid fa-play"></i>
                    </button>
                    <div class="voice-progress-container">
                        <div class="voice-waveform-placeholder">
                            <span></span><span></span><span></span><span></span><span></span>
                            <span></span><span></span><span></span><span></span><span></span>
                            <span></span><span></span><span></span><span></span><span></span>
                        </div>
                        <div class="voice-player-time">
                            <span class="curr-time">0:00</span>
                            <span class="dur-time">0:10</span>
                        </div>
                    </div>
                    <audio id="audio-el-${post.id}" src="${post.mediaData.startsWith('MOCK_') ? '' : post.mediaData}" class="hidden"></audio>
                </div>
            `;
        }
        
        const rHeart = post.reactions && post.reactions.love ? Object.keys(post.reactions.love).length : 0;
        const rHug = post.reactions && post.reactions.hug ? Object.keys(post.reactions.hug).length : 0;
        const rSupport = post.reactions && post.reactions.support ? Object.keys(post.reactions.support).length : 0;
        const rCoffee = post.reactions && post.reactions.coffee ? Object.keys(post.reactions.coffee).length : 0;
        
        const hasHeart = post.reactions && post.reactions.love && post.reactions.love[state.currentUser.name] ? 'reacted' : '';
        const hasHug = post.reactions && post.reactions.hug && post.reactions.hug[state.currentUser.name] ? 'reacted' : '';
        const hasSupport = post.reactions && post.reactions.support && post.reactions.support[state.currentUser.name] ? 'reacted' : '';
        const hasCoffee = post.reactions && post.reactions.coffee && post.reactions.coffee[state.currentUser.name] ? 'reacted' : '';
        
        let commentsHtml = '';
        if (post.comments) {
            const commentsArray = Object.keys(post.comments).map(k => post.comments[k]);
            if (commentsArray.length > 0) {
                commentsHtml = `
                    <div class="quick-comments-list">
                        ${commentsArray.map(c => `
                            <div class="comment-item">
                                <span class="comment-author">${c.authorName}:</span>
                                <span>${escapeHtml(c.text)}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        }
        
        const cardHtml = `
            <div class="glass-card post-card" id="post-${post.id}">
                <div class="post-header">
                    <div class="post-author-info">
                        <div class="post-author-avatar-container">
                            <div class="post-author-avatar" style="background: linear-gradient(135deg, #a78bfa, #18181b)">${post.authorName.charAt(0).toUpperCase()}</div>
                            <div class="mood-glow" style="background-color: ${moodObj.color}; box-shadow: 0 0 10px ${moodObj.color};"></div>
                        </div>
                        <div class="post-author-details">
                            <span class="post-author-name">${post.authorName}</span>
                            <span class="post-time">${post.timestamp}</span>
                        </div>
                    </div>
                    <div class="post-mood-badge">
                        <span>${moodObj.emoji}</span>
                        <span>${moodObj.label}</span>
                    </div>
                </div>
                
                <div class="post-body">
                    <p>${escapeHtml(post.content)}</p>
                </div>
                
                ${mediaHtml}
                
                <div class="post-footer">
                    <div class="reaction-bar">
                        <button class="reaction-btn ${hasHeart}" onclick="reactToPost('${post.id}', 'love')">
                            <span class="react-emoji">❤️</span>
                            <span class="react-count">${rHeart || ''}</span>
                        </button>
                        <button class="reaction-btn ${hasHug}" onclick="reactToPost('${post.id}', 'hug')">
                            <span class="react-emoji">🫂</span>
                            <span class="react-count">${rHug || ''}</span>
                        </button>
                        <button class="reaction-btn ${hasSupport}" onclick="reactToPost('${post.id}', 'support')">
                            <span class="react-emoji">💪</span>
                            <span class="react-count">${rSupport || ''}</span>
                        </button>
                        <button class="reaction-btn ${hasCoffee}" onclick="reactToPost('${post.id}', 'coffee')">
                            <span class="react-emoji">☕</span>
                            <span class="react-count">${rCoffee || ''}</span>
                        </button>
                    </div>
                    
                    <div class="comment-trigger">
                        <span style="font-size: 11px; color: var(--color-text-secondary); cursor: pointer;" onclick="focusCommentInput('${post.id}')">
                            <i class="fa-regular fa-comment"></i> 回應 (${post.comments ? Object.keys(post.comments).length : 0})
                        </span>
                    </div>
                </div>
                
                ${commentsHtml}
                
                <div class="comment-input-area hidden" id="comment-box-${post.id}" style="margin-top: 8px; display: flex; gap: 8px;">
                    <input type="text" id="comment-input-${post.id}" class="custom-select" style="flex-grow: 1; border-radius: 20px; font-size:12px; padding: 6px 14px;" placeholder="寫下溫暖的回應..." onkeydown="handleCommentSubmit(event, '${post.id}')">
                    <button class="primary-btn" style="border-radius: 20px; padding: 6px 12px; font-size: 11px;" onclick="submitComment('${post.id}')">傳送</button>
                </div>
            </div>
        `;
        
        feedEl.insertAdjacentHTML('beforeend', cardHtml);
    });
}

// --- 6. EVENT LISTENERS ---

let photoAttachedBase64 = null;
let voiceAttachedBlob = null;
let voiceAttachedBase64 = null;

function setupEventListeners() {
    // Mood select buttons
    document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const btnEl = e.currentTarget;
            const mood = btnEl.dataset.mood;
            
            state.currentUser.mood = mood;
            localStorage.setItem('heartspace_user_profile', JSON.stringify(state.currentUser));
            
            if (state.isFirebaseConnected && db) {
                db.ref(`groups/${state.groupCode}/users/${state.currentUser.name}/mood`).set(mood);
            } else {
                updateProfileUI();
                renderFriendsList();
            }
            updateProfileUI();
        });
    });
    
    // Feed Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderFeed(e.target.dataset.filter);
        });
    });

    // Attach Photo Trigger
    const attachPhotoBtn = document.getElementById('attach-photo-btn');
    const photoInput = document.getElementById('photo-input');
    
    attachPhotoBtn.addEventListener('click', () => photoInput.click());
    
    photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const max_size = 500;
                
                if (width > height) {
                    if (width > max_size) {
                        height *= max_size / width;
                        width = max_size;
                    }
                } else {
                    if (height > max_size) {
                        width *= max_size / height;
                        height = max_size;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                photoAttachedBase64 = canvas.toDataURL('image/jpeg', 0.5);
                
                document.getElementById('photo-preview').src = photoAttachedBase64;
                document.getElementById('photo-preview-container').classList.remove('hidden');
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
    
    document.getElementById('remove-photo').addEventListener('click', () => {
        photoAttachedBase64 = null;
        document.getElementById('photo-input').value = '';
        document.getElementById('photo-preview-container').classList.add('hidden');
    });

    // Recording triggers
    const attachVoiceBtn = document.getElementById('attach-voice-btn');
    attachVoiceBtn.addEventListener('click', () => openVoiceRecorderModal());
    
    document.getElementById('close-voice-modal').addEventListener('click', () => closeVoiceRecorderModal());
    document.getElementById('cancel-recording').addEventListener('click', () => closeVoiceRecorderModal());
    document.getElementById('remove-voice').addEventListener('click', () => {
        voiceAttachedBlob = null;
        voiceAttachedBase64 = null;
        document.getElementById('voice-preview-container').classList.add('hidden');
    });

    // Submit Post
    document.getElementById('submit-post-btn').addEventListener('click', submitPost);
    
    // Copy Invite Link
    document.getElementById('copy-invite-btn').addEventListener('click', copyInviteLink);
    
    // Lightbox triggers
    document.getElementById('close-lightbox').addEventListener('click', () => {
        document.getElementById('lightbox-modal').classList.add('hidden');
    });
    
    // Shortcut contact buttons (LINE/IG redirects)
    document.getElementById('shortcut-line-btn').addEventListener('click', (e) => {
        const lineContacts = Object.keys(state.friends)
            .map(k => state.friends[k])
            .filter(f => f.lineId);
        if (lineContacts.length > 0) {
            e.preventDefault();
            window.open(`https://line.me/ti/p/~${lineContacts[0].lineId}`, '_blank');
        }
    });

    document.getElementById('shortcut-ig-btn').addEventListener('click', (e) => {
        const igContacts = Object.keys(state.friends)
            .map(k => state.friends[k])
            .filter(f => f.igUsername);
        if (igContacts.length > 0) {
            e.preventDefault();
            window.open(`https://instagram.com/_u/${igContacts[0].igUsername}/`, '_blank');
        }
    });
}

// --- 7. POST SUBMISSION ---

function submitPost() {
    const postInput = document.getElementById('post-input');
    const content = postInput.value.trim();
    
    if (!content && !photoAttachedBase64 && !voiceAttachedBase64) {
        alert('請先輸入文字近況、上傳照片或錄音！');
        return;
    }
    
    let type = 'status';
    let mediaData = null;
    
    if (photoAttachedBase64) {
        type = 'photo';
        mediaData = photoAttachedBase64;
    } else if (voiceAttachedBase64) {
        type = 'voice';
        mediaData = voiceAttachedBase64;
    }
    
    const now = new Date();
    const timeString = `今天 ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const newPost = {
        authorName: state.currentUser.name,
        type: type,
        content: content || (type === 'photo' ? '分享了一張拍立得照片 ✨' : '留了一段語音悄悄話 🎧'),
        mediaData: mediaData,
        timestamp: timeString,
        createdAt: Date.now(),
        mood: state.currentUser.mood,
        reactions: { love: {}, hug: {}, support: {}, coffee: {} },
        comments: {}
    };
    
    // Helper to clean UI input fields
    const resetInputs = () => {
        postInput.value = '';
        photoAttachedBase64 = null;
        voiceAttachedBase64 = null;
        voiceAttachedBlob = null;
        
        document.getElementById('photo-preview-container').classList.add('hidden');
        document.getElementById('voice-preview-container').classList.add('hidden');
        document.getElementById('photo-input').value = '';
    };

    // If Firebase is active and connected, push to cloud
    if (state.isFirebaseConnected && db) {
        db.ref(`groups/${state.groupCode}/posts`).push(newPost)
            .then(() => {
                resetInputs();
                db.ref(`groups/${state.groupCode}/users/${state.currentUser.name}`).update({
                    status: content.substring(0, 15) + (content.length > 15 ? '...' : '') || '剛發佈了點滴',
                    lastActive: Date.now()
                });
            })
            .catch(err => {
                console.error("Firebase error posting:", err);
                // Failover to local cache on error
                savePostLocally(newPost);
                resetInputs();
            });
    } else {
        // Run locally
        savePostLocally(newPost);
        resetInputs();
    }
}

function savePostLocally(post) {
    post.id = 'post_local_' + Date.now();
    state.posts.unshift(post);
    saveLocalCache();
    renderFeed(document.querySelector('.filter-btn.active').dataset.filter);
}

// --- 8. COPY INVITE LINK ---

function copyInviteLink() {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${state.groupCode}`;
    
    navigator.clipboard.writeText(inviteUrl)
        .then(() => {
            const btn = document.getElementById('copy-invite-btn');
            const span = btn.querySelector('span');
            span.textContent = '已複製邀請網址！';
            btn.style.background = 'rgba(131, 197, 190, 0.2)';
            
            setTimeout(() => {
                span.textContent = '複製專屬邀請連結';
                btn.style.background = 'rgba(255,255,255,0.06)';
            }, 2500);
        })
        .catch(err => {
            console.error("Clipboard copy failed:", err);
            alert(`複製失敗，請手動複製此邀請連結：\n${inviteUrl}`);
        });
}

// --- 8.5 MEMBER REMOVAL ---

window.removeFriend = function(friendName) {
    if (confirm(`確定要將成員「${friendName}」移出這個空間嗎？`)) {
        if (state.isFirebaseConnected && db) {
            db.ref(`groups/${state.groupCode}/users/${friendName}`).remove()
                .then(() => {
                    alert(`已將成員「${friendName}」移出此空間。`);
                })
                .catch(err => {
                    console.error("Firebase removal failed:", err);
                    alert("移除成員失敗，請稍候再試。");
                });
        } else {
            // Local mode fallback
            delete state.friends[friendName];
            saveLocalCache();
            renderFriendsList();
            alert(`已在本地將「${friendName}」移除。`);
        }
    }
};

// --- 9. VOICE RECORDING (MEDIARECORDER + WEB AUDIO SYNTH) ---

let mediaRecorder = null;
let audioChunks = [];
let recordTimerInterval = null;
let isRecording = false;

function openVoiceRecorderModal() {
    const modal = document.getElementById('voice-modal');
    modal.classList.remove('hidden');
    
    document.getElementById('mic-icon').className = "fa-solid fa-microphone";
    document.getElementById('record-timer').textContent = "00:00";
    document.getElementById('recording-status').textContent = "點擊麥克風按鈕開始錄製 (限時10秒)";
    document.getElementById('save-recording').classList.add('hidden');
    modal.classList.remove('recording');
    
    const recordBtn = document.getElementById('record-action-btn');
    recordBtn.onclick = toggleRecording;
}

function closeVoiceRecorderModal() {
    stopRecording(false);
    document.getElementById('voice-modal').classList.add('hidden');
}

function toggleRecording() {
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording(true);
    }
}

function startRecording() {
    isRecording = true;
    audioChunks = [];
    
    const useMock = document.getElementById('use-mock-audio').checked;
    
    document.getElementById('voice-modal').classList.add('recording');
    document.getElementById('mic-icon').className = "fa-solid fa-square";
    document.getElementById('recording-status').textContent = "正在錄音中... 再次點擊按鈕結束";
    document.getElementById('save-recording').classList.add('hidden');
    
    let seconds = 0;
    recordTimerInterval = setInterval(() => {
        seconds++;
        document.getElementById('record-timer').textContent = `00:${seconds.toString().padStart(2, '0')}`;
        if (seconds >= 10) {
            stopRecording(true);
        }
    }, 1000);
    
    if (useMock) return;
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
            
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                voiceAttachedBlob = audioBlob;
                
                const reader = new FileReader();
                reader.onloadend = () => {
                    voiceAttachedBase64 = reader.result;
                    document.getElementById('save-recording').classList.remove('hidden');
                };
                reader.readAsDataURL(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };
            mediaRecorder.start();
        })
        .catch(err => {
            console.warn("Microphone access denied:", err);
            document.getElementById('use-mock-audio').checked = true;
            document.getElementById('recording-status').textContent = "麥克風權限受阻，已切換至語音模擬器。";
        });
}

function stopRecording(keepData) {
    if (!isRecording) return;
    isRecording = false;
    
    clearInterval(recordTimerInterval);
    document.getElementById('voice-modal').classList.remove('recording');
    document.getElementById('mic-icon').className = "fa-solid fa-microphone";
    document.getElementById('recording-status').textContent = keepData ? "錄製完成！點擊儲存" : "已取消";
    
    const useMock = document.getElementById('use-mock-audio').checked;
    
    if (useMock && keepData) {
        voiceAttachedBase64 = 'MOCK_SYNTH_AUDIO_' + Date.now();
        document.getElementById('save-recording').classList.remove('hidden');
    } else if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    
    document.getElementById('save-recording').onclick = () => {
        if (voiceAttachedBase64) {
            const voicePreview = document.getElementById('voice-preview-container');
            voicePreview.querySelector('.voice-duration').textContent = document.getElementById('record-timer').textContent;
            voicePreview.classList.remove('hidden');
            closeVoiceRecorderModal();
        }
    };
}

// --- 10. VOICE PLAYBACK CONTROL ---

let activeAudio = null;
let activeAudioId = null;
let synthInterval = null;

function togglePlayVoice(postId, mediaData) {
    const playerEl = document.getElementById(`voice-player-${postId}`);
    const playBtn = playerEl.querySelector('.voice-play-btn');
    const icon = playBtn.querySelector('i');
    const audioEl = document.getElementById(`audio-el-${postId}`);
    const timeSpan = playerEl.querySelector('.curr-time');
    
    if (activeAudioId === postId) {
        pauseActiveAudio();
        return;
    }
    
    pauseActiveAudio();
    
    activeAudioId = postId;
    playerEl.classList.add('playing');
    icon.className = "fa-solid fa-pause";
    
    if (mediaData.startsWith('MOCK_')) {
        playSimulatedChimes(postId, playerEl, icon, timeSpan);
    } else {
        activeAudio = audioEl;
        audioEl.currentTime = 0;
        audioEl.play();
        
        audioEl.ontimeupdate = () => {
            const minutes = Math.floor(audioEl.currentTime / 60);
            const seconds = Math.floor(audioEl.currentTime % 60);
            timeSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        };
        
        audioEl.onended = () => pauseActiveAudio();
    }
}

function pauseActiveAudio() {
    if (!activeAudioId) return;
    
    const playerEl = document.getElementById(`voice-player-${activeAudioId}`);
    if (playerEl) {
        playerEl.classList.remove('playing');
        playerEl.querySelector('.voice-play-btn i').className = "fa-solid fa-play";
        playerEl.querySelector('.curr-time').textContent = "0:00";
    }
    
    if (activeAudio) {
        activeAudio.pause();
        activeAudio.currentTime = 0;
        activeAudio = null;
    }
    
    if (synthInterval) {
        clearInterval(synthInterval);
        synthInterval = null;
    }
    
    activeAudioId = null;
}

function playSimulatedChimes(postId, playerEl, icon, timeSpan) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [392.00, 523.25, 587.33, 659.25, 783.99, 1046.50];
    let step = 0;
    const maxSteps = 10;
    
    timeSpan.textContent = "0:00";
    
    synthInterval = setInterval(() => {
        step++;
        timeSpan.textContent = `0:${step.toString().padStart(2, '0')}`;
        
        if (step % 2 === 1) {
            const randomNote = notes[Math.floor(Math.random() * notes.length)];
            triggerSynthOscillator(audioCtx, randomNote, 1.2);
        } else {
            const rNote1 = notes[Math.floor(Math.random() * 3)];
            const rNote2 = notes[Math.floor(Math.random() * 3) + 3];
            triggerSynthOscillator(audioCtx, rNote1, 0.8);
            setTimeout(() => triggerSynthOscillator(audioCtx, rNote2, 1.5), 180);
        }
        
        if (step >= maxSteps) pauseActiveAudio();
    }, 1000);
    
    triggerSynthOscillator(audioCtx, notes[1], 1.5);
    setTimeout(() => triggerSynthOscillator(audioCtx, notes[4], 1.2), 250);
}

function triggerSynthOscillator(audioCtx, frequency, duration) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.08);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

// --- 11. REACTIONS & COMMENTS (HYBRID SYNC) ---

function reactToPost(postId, reactionType) {
    const post = state.posts.find(p => p.id === postId);
    if (!post) return;
    
    if (state.isFirebaseConnected && db) {
        const userReactPath = `groups/${state.groupCode}/posts/${postId}/reactions/${reactionType}/${state.currentUser.name}`;
        const hasReacted = post.reactions && post.reactions[reactionType] && post.reactions[reactionType][state.currentUser.name];
        
        if (hasReacted) {
            db.ref(userReactPath).remove();
        } else {
            db.ref(userReactPath).set(true);
        }
    } else {
        // Toggle locally
        if (!post.reactions) post.reactions = {};
        if (!post.reactions[reactionType]) post.reactions[reactionType] = {};
        
        const hasReacted = post.reactions[reactionType][state.currentUser.name];
        if (hasReacted) {
            delete post.reactions[reactionType][state.currentUser.name];
        } else {
            post.reactions[reactionType][state.currentUser.name] = true;
        }
        saveLocalCache();
        renderFeed(document.querySelector('.filter-btn.active').dataset.filter);
    }
}

function focusCommentInput(postId) {
    const commentBox = document.getElementById(`comment-box-${postId}`);
    commentBox.classList.toggle('hidden');
    if (!commentBox.classList.contains('hidden')) {
        document.getElementById(`comment-input-${postId}`).focus();
    }
}

function handleCommentSubmit(event, postId) {
    if (event.key === 'Enter') {
        submitComment(postId);
    }
}

function submitComment(postId) {
    const inputEl = document.getElementById(`comment-input-${postId}`);
    const text = inputEl.value.trim();
    if (!text) return;
    
    const post = state.posts.find(p => p.id === postId);
    if (!post) return;
    
    const comment = {
        authorName: state.currentUser.name,
        text: text,
        timestamp: '剛剛'
    };
    
    if (state.isFirebaseConnected && db) {
        const commentRef = db.ref(`groups/${state.groupCode}/posts/${postId}/comments`).push();
        commentRef.set(comment).then(() => {
            inputEl.value = '';
        });
    } else {
        // Run locally
        if (!post.comments) post.comments = {};
        const cId = 'comment_local_' + Date.now();
        post.comments[cId] = comment;
        saveLocalCache();
        inputEl.value = '';
        renderFeed(document.querySelector('.filter-btn.active').dataset.filter);
    }
}

// --- 12. UTILS ---

function openLightbox(imgSrc, captionText) {
    const lightbox = document.getElementById('lightbox-modal');
    const lightboxImg = document.getElementById('lightbox-img');
    const caption = document.getElementById('lightbox-caption');
    
    lightboxImg.src = imgSrc;
    caption.textContent = captionText || '生活日常 📷';
    lightbox.classList.remove('hidden');
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

window.addEventListener('DOMContentLoaded', initApp);
