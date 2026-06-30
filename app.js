/* ==========================================================================
   HEARTSPACE CORE APPLICATION LOGIC (FIREBASE SYNC & REALTIME EDITION)
   ========================================================================== */

// --- 1. FIREBASE CONFIGURATION & INITIALIZATION ---

// Using a public sandbox Realtime Database hosted for the HeartSpace project
const firebaseConfig = {
    databaseURL: "https://gemini-antigravity-default-rtdb.firebaseio.com"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- 2. GLOBAL STATE ---

let state = {
    currentUser: null,       // Loaded from LocalStorage: { name, groupCode, lineId, igUsername, mood }
    groupCode: null,         // Active friendship space identifier
    posts: [],               // Synced from Firebase groups/groupCode/posts
    friends: {}              // Synced from Firebase groups/groupCode/users
};

const MOODS = {
    happy: { label: '活力充沛', emoji: '✨', color: '#ffd166', status: '正能量滿滿，今天效率超高！' },
    relaxed: { label: '慵懶放鬆', emoji: '☕', color: '#83c5be', status: '泡杯熱茶，看著窗外發呆。' },
    tired: { label: '疲憊想睡', emoji: '😴', color: '#a78bfa', status: '腦袋空空的，好想立刻躺平。' },
    busy: { label: '瘋狂忙碌', emoji: '🔥', color: '#f28482', status: '被死線追趕，暫時無法分神...' },
    emo: { label: '心碎沮喪', emoji: '🌧️', color: '#90e0ef', status: '需要一點溫暖，今天有點小 emo。' }
};

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
        
        // If invite parameters are different, prompt update or auto join
        if (inviteCode && inviteCode !== state.groupCode) {
            if (confirm(`偵測到新的邀請連結！要從目前的群組「${state.groupCode}」切換至「${inviteCode}」嗎？`)) {
                state.currentUser.groupCode = inviteCode;
                state.groupCode = inviteCode;
                localStorage.setItem('heartspace_user_profile', JSON.stringify(state.currentUser));
                // Clear URL parameters for cleanliness
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }
        
        connectToFirebase();
        setupEventListeners();
    } else {
        // Open Onboarding welcome Modal
        const onboardModal = document.getElementById('onboard-modal');
        onboardModal.classList.remove('hidden');
        
        if (inviteCode) {
            document.getElementById('onboard-invite').value = inviteCode;
        }
        
        setupOnboardingListeners();
    }
}

// Setup listeners specifically for onboarding
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
        
        // Build User Profile
        state.currentUser = {
            name: nameInput,
            groupCode: inviteInput,
            lineId: lineInput,
            igUsername: igInput,
            mood: 'relaxed' // Default mood
        };
        state.groupCode = inviteInput;
        
        // Save to LocalStorage
        localStorage.setItem('heartspace_user_profile', JSON.stringify(state.currentUser));
        
        // Hide modal
        document.getElementById('onboard-modal').classList.add('hidden');
        
        // Connect and build
        connectToFirebase();
        setupEventListeners();
        
        // Clear url parameters if present
        window.history.replaceState({}, document.title, window.location.pathname);
    };
}

// --- 4. FIREBASE CONNECTIVITY & LISTENERS ---

function connectToFirebase() {
    document.getElementById('active-space-name').textContent = `空間: ${state.groupCode}`;
    
    // Register current user's profile on Firebase Database under this group
    const userRef = db.ref(`groups/${state.groupCode}/users/${state.currentUser.name}`);
    userRef.set({
        name: state.currentUser.name,
        lineId: state.currentUser.lineId || '',
        igUsername: state.currentUser.igUsername || '',
        mood: state.currentUser.mood,
        lastActive: Date.now()
    });
    
    // Auto-update last active timestamp on disconnect
    userRef.onDisconnect().update({
        lastActive: firebase.database.ServerValue.TIMESTAMP
    });
    
    // Watch Database for Posts Updates
    db.ref(`groups/${state.groupCode}/posts`).on('value', (snapshot) => {
        const data = snapshot.val();
        state.posts = [];
        if (data) {
            // Convert object map to sorted array (newest first)
            Object.keys(data).forEach(key => {
                state.posts.push({
                    id: key,
                    ...data[key]
                });
            });
            state.posts.sort((a, b) => b.createdAt - a.createdAt);
        }
        renderFeed(document.querySelector('.filter-btn.active').dataset.filter);
    });
    
    // Watch Database for Users (Friends) updates
    db.ref(`groups/${state.groupCode}/users`).on('value', (snapshot) => {
        const data = snapshot.val();
        state.friends = data || {};
        updateProfileUI();
        renderFriendsList();
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
    
    // Get current mood from active state
    const currentMood = state.currentUser.mood;
    const moodColor = MOODS[currentMood]?.color || '#83c5be';
    glow.style.backgroundColor = moodColor;
    glow.style.boxShadow = `0 0 20px ${moodColor}`;
    
    // Update active state in mood selection buttons
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
        
        // Calculate status time
        let activeStatusText = '離線';
        const isOnline = (Date.now() - friend.lastActive) < 120000; // Active within 2 minutes
        
        if (isOnline) {
            activeStatusText = moodObj.status || '線上活躍中';
        } else {
            const diffMin = Math.floor((Date.now() - friend.lastActive) / 60000);
            if (diffMin < 60) {
                activeStatusText = `${diffMin} 分鐘前在線上`;
            } else {
                const diffHr = Math.floor(diffMin / 60);
                activeStatusText = diffHr < 24 ? `${diffHr} 小時前在線上` : `${Math.floor(diffHr/24)} 天前在線上`;
            }
        }
        
        // LINE/IG URL schemes
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
                <div class="friend-social-links">
                    <a href="${lineHref}" target="_blank" class="friend-social-icon ${lineClass}" title="在 LINE 傳送悄悄話"><i class="fa-brands fa-line"></i></a>
                    <a href="${igHref}" target="_blank" class="friend-social-icon ${igClass}" title="查看 Instagram"><i class="fa-brands fa-instagram"></i></a>
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
        
        // Build post content media element
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
        
        // Build reactions counts
        const rHeart = post.reactions && post.reactions.love ? Object.keys(post.reactions.love).length : 0;
        const rHug = post.reactions && post.reactions.hug ? Object.keys(post.reactions.hug).length : 0;
        const rSupport = post.reactions && post.reactions.support ? Object.keys(post.reactions.support).length : 0;
        const rCoffee = post.reactions && post.reactions.coffee ? Object.keys(post.reactions.coffee).length : 0;
        
        // Check if current user reacted
        const hasHeart = post.reactions && post.reactions.love && post.reactions.love[state.currentUser.name] ? 'reacted' : '';
        const hasHug = post.reactions && post.reactions.hug && post.reactions.hug[state.currentUser.name] ? 'reacted' : '';
        const hasSupport = post.reactions && post.reactions.support && post.reactions.support[state.currentUser.name] ? 'reacted' : '';
        const hasCoffee = post.reactions && post.reactions.coffee && post.reactions.coffee[state.currentUser.name] ? 'reacted' : '';
        
        // Build comments list
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
                <!-- Author Header -->
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
                
                <!-- Main Body -->
                <div class="post-body">
                    <p>${escapeHtml(post.content)}</p>
                </div>
                
                <!-- Media Elements (Photo/Voice) -->
                ${mediaHtml}
                
                <!-- Footer & Reactions -->
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
                
                <!-- Comments list -->
                ${commentsHtml}
                
                <!-- Comment input box -->
                <div class="comment-input-area hidden" id="comment-box-${post.id}" style="margin-top: 8px; display: flex; gap: 8px;">
                    <input type="text" id="comment-input-${post.id}" class="custom-select" style="flex-grow: 1; border-radius: 20px; font-size:12px; padding: 6px 14px;" placeholder="寫下溫慢的回應..." onkeydown="handleCommentSubmit(event, '${post.id}')">
                    <button class="primary-btn" style="border-radius: 20px; padding: 6px 12px; font-size: 11px;" onclick="submitComment('${post.id}')">傳送</button>
                </div>
            </div>
        `;
        
        feedEl.insertAdjacentHTML('beforeend', cardHtml);
    });
}

// --- 6. EVENT LISTENERS & TRIGGERS ---

let photoAttachedBase64 = null;
let voiceAttachedBlob = null;
let voiceAttachedBase64 = null;

function setupEventListeners() {
    // Mood select buttons
    document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const btnEl = e.currentTarget;
            const mood = btnEl.dataset.mood;
            
            // Set locally
            state.currentUser.mood = mood;
            localStorage.setItem('heartspace_user_profile', JSON.stringify(state.currentUser));
            
            // Sync to Firebase
            db.ref(`groups/${state.groupCode}/users/${state.currentUser.name}/mood`).set(mood);
            
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
    
    attachPhotoBtn.addEventListener('click', () => {
        photoInput.click();
    });
    
    photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Canvas compression
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
                
                photoAttachedBase64 = canvas.toDataURL('image/jpeg', 0.5); // high compression for database efficiency
                
                // Update preview
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
    
    // Copy Invite Link Button
    document.getElementById('copy-invite-btn').addEventListener('click', copyInviteLink);
    
    // Lightbox triggers
    document.getElementById('close-lightbox').addEventListener('click', () => {
        document.getElementById('lightbox-modal').classList.add('hidden');
    });
    
    // Shortcut contact buttons
    document.getElementById('shortcut-line-btn').addEventListener('click', (e) => {
        // If there's a group profile, check if we want to change url
        const lineContacts = Object.keys(state.friends)
            .map(k => state.friends[k])
            .filter(f => f.lineId);
        if (lineContacts.length > 0) {
            e.preventDefault();
            const firstFriend = lineContacts[0];
            window.open(`https://line.me/ti/p/~${firstFriend.lineId}`, '_blank');
        }
    });

    document.getElementById('shortcut-ig-btn').addEventListener('click', (e) => {
        const igContacts = Object.keys(state.friends)
            .map(k => state.friends[k])
            .filter(f => f.igUsername);
        if (igContacts.length > 0) {
            e.preventDefault();
            const firstFriend = igContacts[0];
            window.open(`https://instagram.com/_u/${firstFriend.igUsername}/`, '_blank');
        }
    });
}

// --- 7. POST SUBMISSION (TO FIREBASE) ---

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
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        mood: state.currentUser.mood,
        reactions: { love: {}, hug: {}, support: {}, coffee: {} },
        comments: {}
    };
    
    // Save to Firebase (automatically pushes and syncs across friends)
    db.ref(`groups/${state.groupCode}/posts`).push(newPost)
        .then(() => {
            // Reset fields
            postInput.value = '';
            photoAttachedBase64 = null;
            voiceAttachedBase64 = null;
            voiceAttachedBlob = null;
            
            document.getElementById('photo-preview-container').classList.add('hidden');
            document.getElementById('voice-preview-container').classList.add('hidden');
            document.getElementById('photo-input').value = '';
            
            // Keep radar status updated
            db.ref(`groups/${state.groupCode}/users/${state.currentUser.name}`).update({
                status: content.substring(0, 15) + (content.length > 15 ? '...' : '') || '剛發佈了點滴',
                lastActive: Date.now()
            });
        })
        .catch(err => {
            console.error("Firebase error posting:", err);
            alert("發佈失敗，請檢查您的網路連線。");
        });
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
            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };
            
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

// --- 10. VOICE PLAYBACK CONTROL (BROWSER AUDIO / WEB SYNTH) ---

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

// --- 11. REACTIONS & COMMENTS (SYNCED TO FIREBASE) ---

function reactToPost(postId, reactionType) {
    const post = state.posts.find(p => p.id === postId);
    if (!post) return;
    
    const userReactPath = `groups/${state.groupCode}/posts/${postId}/reactions/${reactionType}/${state.currentUser.name}`;
    
    // Toggle reaction directly in Firebase
    const hasReacted = post.reactions && post.reactions[reactionType] && post.reactions[reactionType][state.currentUser.name];
    
    if (hasReacted) {
        db.ref(userReactPath).remove();
    } else {
        db.ref(userReactPath).set(true);
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
    
    const commentRef = db.ref(`groups/${state.groupCode}/posts/${postId}/comments`).push();
    commentRef.set({
        authorName: state.currentUser.name,
        text: text,
        timestamp: '剛剛'
    }).then(() => {
        inputEl.value = '';
    });
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
