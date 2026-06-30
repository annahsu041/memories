/* ==========================================================================
   HEARTSPACE CORE APPLICATION LOGIC
   ========================================================================== */

// --- 1. CONFIGURATION & STATE MANAGEMENT ---

const USER_PROFILES = {
    user_me: {
        id: 'user_me',
        name: '我 (Hanna)',
        avatar: 'H',
        avatarColor: '#f59e0b', // Orange glow
        mood: 'happy',
        social: { line: '#', ig: '#' }
    },
    friend_yuki: {
        id: 'friend_yuki',
        name: 'Yuki',
        avatar: 'Y',
        avatarColor: '#10b981', // Emerald glow
        mood: 'relaxed',
        social: { line: 'https://line.me/tw/', ig: 'https://instagram.com' }
    },
    friend_alan: {
        id: 'friend_alan',
        name: 'Alan',
        avatar: 'A',
        avatarColor: '#8b5cf6', // Purple glow
        mood: 'tired',
        social: { line: 'https://line.me/tw/', ig: 'https://instagram.com' }
    },
    friend_doris: {
        id: 'friend_doris',
        name: 'Doris',
        avatar: 'D',
        avatarColor: '#ec4899', // Pink glow
        mood: 'busy',
        social: { line: 'https://line.me/tw/', ig: 'https://instagram.com' }
    }
};

const MOODS = {
    happy: { label: '活力充沛', emoji: '✨', color: '#ffd166', status: '正能量滿滿，今天效率超高！' },
    relaxed: { label: '慵懶放鬆', emoji: '☕', color: '#83c5be', status: '泡杯熱茶，看著窗外發呆。' },
    tired: { label: '疲憊想睡', emoji: '😴', color: '#a78bfa', status: '腦袋空空的，好想立刻躺平。' },
    busy: { label: '瘋狂忙碌', emoji: '🔥', color: '#f28482', status: '被死線追趕，暫時無法分神...' },
    emo: { label: '心碎沮喪', emoji: '🌧️', color: '#90e0ef', status: '需要一點溫暖，今天有點小 emo。' }
};

// Global App State
let state = {
    currentUser: 'user_me',
    posts: [],
    friends: {
        friend_yuki: { mood: 'relaxed', status: '在咖啡廳躲雨 ☕', lastActive: '10 分鐘前' },
        friend_alan: { mood: 'tired', status: '加班除錯中... 💻', lastActive: '1 小時前' },
        friend_doris: { mood: 'busy', status: '瘋狂會議中 📅', lastActive: '30 分鐘前' }
    }
};

// Prepopulated Default Posts if LocalStorage is empty
const DEFAULT_POSTS = [
    {
        id: 'post_1',
        author: 'friend_yuki',
        type: 'photo',
        content: '忙裡偷閒！這家巷弄裡的咖啡館特別安靜，肉桂捲超級美味。點了一杯卡布奇諾，看完了半本書。送一隻雲端肉桂捲給你們 🥐☕',
        mediaData: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&auto=format&fit=crop&q=80',
        timestamp: '今天 14:32',
        mood: 'relaxed',
        reactions: { love: ['friend_alan', 'user_me'], hug: ['friend_doris'] },
        comments: [
            { author: 'friend_alan', text: '天哪！肉桂捲看起來太犯規了，求店名！', timestamp: '14:40' },
            { author: 'user_me', text: '下週末約這間！我也要去！', timestamp: '15:12' }
        ]
    },
    {
        id: 'post_2',
        author: 'friend_alan',
        type: 'voice',
        content: '給大家聽聽我這邊窗外的雨聲，伴隨著鍵盤聲，還蠻舒壓的。希望大家今天一切順利，加油啦！',
        mediaData: 'MOCK_AUDIO_ALAN', // Simulated dynamic synth sound
        timestamp: '今天 12:15',
        mood: 'tired',
        reactions: { support: ['user_me', 'friend_yuki'], coffee: ['friend_doris'] },
        comments: [
            { author: 'friend_doris', text: '雨聲聽著好療癒，寫 code 加油！', timestamp: '12:30' }
        ]
    },
    {
        id: 'post_3',
        author: 'friend_doris',
        type: 'status',
        content: '剛剛完成了一場長達三小時的專案報告，簡直像打完一場仗 😩 現在只想戴上耳機放空，大家今天過得如何？快留言跟我說話，安慰我受傷的心靈嗚嗚。',
        mediaData: null,
        timestamp: '今天 10:05',
        mood: 'busy',
        reactions: { hug: ['user_me', 'friend_yuki', 'friend_alan'] },
        comments: [
            { author: 'friend_yuki', text: '辛苦了 Doris！抱抱！下班喝一杯！', timestamp: '10:15' }
        ]
    }
];

// --- 2. INITIALIZATION & STORAGE LOAD ---

function initApp() {
    loadFromLocalStorage();
    setupDateTime();
    setupEventListeners();
    updateProfileUI();
    renderFriendsList();
    renderFeed('all');
    
    // Periodically update time
    setInterval(setupDateTime, 60000);
}

function loadFromLocalStorage() {
    const savedPosts = localStorage.getItem('heartspace_posts');
    const savedFriends = localStorage.getItem('heartspace_friends');
    const savedCurrentUser = localStorage.getItem('heartspace_current_user');
    
    if (savedPosts) {
        state.posts = JSON.parse(savedPosts);
    } else {
        state.posts = [...DEFAULT_POSTS];
        savePostsToStorage();
    }
    
    if (savedFriends) {
        state.friends = JSON.parse(savedFriends);
    }
    
    if (savedCurrentUser && USER_PROFILES[savedCurrentUser]) {
        state.currentUser = savedCurrentUser;
        document.getElementById('user-select').value = savedCurrentUser;
    }
}

function savePostsToStorage() {
    localStorage.setItem('heartspace_posts', JSON.stringify(state.posts));
}

function saveFriendsToStorage() {
    localStorage.setItem('heartspace_friends', JSON.stringify(state.friends));
}

// --- 3. DYNAMIC UI RENDERING FUNCTIONS ---

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
    const currentUser = USER_PROFILES[state.currentUser];
    const avatar = document.getElementById('my-avatar');
    const nameEl = document.getElementById('my-profile-name');
    const glow = document.getElementById('my-mood-glow');
    
    avatar.textContent = currentUser.avatar;
    avatar.style.background = `linear-gradient(135deg, ${currentUser.avatarColor}, #3f3f46)`;
    nameEl.textContent = currentUser.name;
    
    // Get mood color
    const moodColor = MOODS[currentUser.mood].color;
    glow.style.backgroundColor = moodColor;
    glow.style.boxShadow = `0 0 20px ${moodColor}`;
    
    // Update active state in mood selection buttons
    document.querySelectorAll('.mood-btn').forEach(btn => {
        if (btn.dataset.mood === currentUser.mood) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function renderFriendsList() {
    const listEl = document.getElementById('friends-list');
    listEl.innerHTML = '';
    
    Object.keys(USER_PROFILES).forEach(profileKey => {
        if (profileKey === state.currentUser) return; // Hide self in list
        
        const profile = USER_PROFILES[profileKey];
        // Get dynamic status/mood from state
        const friendStatus = (profileKey === 'user_me') ? 'Active' : (state.friends[profileKey]?.status || MOODS[profile.mood].status);
        const friendMood = (profileKey === 'user_me') ? profile.mood : (state.friends[profileKey]?.mood || profile.mood);
        const lastActive = (profileKey === 'user_me') ? 'Now' : (state.friends[profileKey]?.lastActive || '剛剛');
        
        const moodObj = MOODS[friendMood];
        
        const itemHtml = `
            <div class="friend-item">
                <div class="friend-profile-info">
                    <div class="friend-avatar-container">
                        <div class="friend-avatar" style="background: linear-gradient(135deg, ${profile.avatarColor}, #27272a)">${profile.avatar}</div>
                        <div class="mood-glow" style="background-color: ${moodObj.color}; box-shadow: 0 0 10px ${moodObj.color};"></div>
                    </div>
                    <div class="friend-details">
                        <span class="friend-name">${profile.name} <span style="font-size:11px" title="${moodObj.label}">${moodObj.emoji}</span></span>
                        <span class="friend-status" title="${friendStatus}">${friendStatus}</span>
                    </div>
                </div>
                <div class="friend-social-links">
                    <a href="${profile.social.line}" target="_blank" class="friend-social-icon" title="在 LINE 傳送悄悄話"><i class="fa-brands fa-line"></i></a>
                    <a href="${profile.social.ig}" target="_blank" class="friend-social-icon" title="查看 Instagram"><i class="fa-brands fa-instagram"></i></a>
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
                <p>這裡目前空空如也，發佈第一條點滴吧！</p>
            </div>
        `;
        return;
    }
    
    filteredPosts.forEach(post => {
        const author = USER_PROFILES[post.author] || { name: '未知摯友', avatar: '?', avatarColor: '#52525b', mood: 'happy' };
        const moodObj = MOODS[post.mood] || { label: '平靜', emoji: '☕', color: '#83c5be' };
        
        // Build post content media element
        let mediaHtml = '';
        if (post.type === 'photo' && post.mediaData) {
            mediaHtml = `
                <div class="polaroid-container" onclick="openLightbox('${post.mediaData}', '${escapeHtml(post.content)}')">
                    <img src="${post.mediaData}" class="polaroid-img" alt="生活瞬間">
                    <div class="polaroid-caption">${author.name} · ${moodObj.emoji} ${moodObj.label}</div>
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
        const rHeart = (post.reactions?.love || []).length;
        const rHug = (post.reactions?.hug || []).length;
        const rSupport = (post.reactions?.support || []).length;
        const rCoffee = (post.reactions?.coffee || []).length;
        
        // Check if current user reacted
        const hasHeart = (post.reactions?.love || []).includes(state.currentUser) ? 'reacted' : '';
        const hasHug = (post.reactions?.hug || []).includes(state.currentUser) ? 'reacted' : '';
        const hasSupport = (post.reactions?.support || []).includes(state.currentUser) ? 'reacted' : '';
        const hasCoffee = (post.reactions?.coffee || []).includes(state.currentUser) ? 'reacted' : '';
        
        // Build comments list
        let commentsHtml = '';
        if (post.comments && post.comments.length > 0) {
            commentsHtml = `
                <div class="quick-comments-list">
                    ${post.comments.map(c => {
                        const commenter = USER_PROFILES[c.author]?.name || '好友';
                        return `
                            <div class="comment-item">
                                <span class="comment-author">${commenter}:</span>
                                <span>${escapeHtml(c.text)}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }
        
        const cardHtml = `
            <div class="glass-card post-card" id="post-${post.id}">
                <!-- Author Header -->
                <div class="post-header">
                    <div class="post-author-info">
                        <div class="post-author-avatar-container">
                            <div class="post-author-avatar" style="background: linear-gradient(135deg, ${author.avatarColor}, #18181b)">${author.avatar}</div>
                            <div class="mood-glow" style="background-color: ${moodObj.color}; box-shadow: 0 0 10px ${moodObj.color};"></div>
                        </div>
                        <div class="post-author-details">
                            <span class="post-author-name">${author.name}</span>
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
                            <i class="fa-regular fa-comment"></i> 回應 (${post.comments?.length || 0})
                        </span>
                    </div>
                </div>
                
                <!-- Comments list -->
                ${commentsHtml}
                
                <!-- Comment input box -->
                <div class="comment-input-area hidden" id="comment-box-${post.id}" style="margin-top: 8px; display: flex; gap: 8px;">
                    <input type="text" id="comment-input-${post.id}" class="custom-select" style="flex-grow: 1; border-radius: 20px; font-size:12px; padding: 6px 14px;" placeholder="寫下溫暖的回應..." onkeydown="handleCommentSubmit(event, '${post.id}')">
                    <button class="primary-btn" style="border-radius: 20px; padding: 6px 12px; font-size: 11px;" onclick="submitComment('${post.id}')">傳送</button>
                </div>
            </div>
        `;
        
        feedEl.insertAdjacentHTML('beforeend', cardHtml);
    });
}

// --- 4. EVENT LISTENERS & USER INTERACTION ---

let photoAttachedBase64 = null;
let voiceAttachedBlob = null;
let voiceAttachedBase64 = null;
let voiceDurationSec = 10;

function setupEventListeners() {
    // Simulator switcher
    document.getElementById('user-select').addEventListener('change', (e) => {
        state.currentUser = e.target.value;
        localStorage.setItem('heartspace_current_user', state.currentUser);
        updateProfileUI();
        renderFriendsList();
        renderFeed(document.querySelector('.filter-btn.active').dataset.filter);
    });
    
    // Mood select buttons
    document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const btnEl = e.currentTarget;
            const mood = btnEl.dataset.mood;
            
            // Set mood in user profile state
            USER_PROFILES[state.currentUser].mood = mood;
            
            // If it is a simulated friend, update their status in the radar
            if (state.currentUser !== 'user_me') {
                if (!state.friends[state.currentUser]) state.friends[state.currentUser] = {};
                state.friends[state.currentUser].mood = mood;
                state.friends[state.currentUser].status = MOODS[mood].status;
                saveFriendsToStorage();
            }
            
            updateProfileUI();
            renderFriendsList();
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
        
        // Perform Canvas Compression to keep LocalStorage slim
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                // Compress image to 500x500 square or proportionate boundaries
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const max_size = 600;
                
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
                
                // JPEG compression at 0.6 quality
                photoAttachedBase64 = canvas.toDataURL('image/jpeg', 0.6);
                
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
    const voiceModal = document.getElementById('voice-modal');
    
    attachVoiceBtn.addEventListener('click', () => {
        openVoiceRecorderModal();
    });
    
    document.getElementById('close-voice-modal').addEventListener('click', () => {
        closeVoiceRecorderModal();
    });
    
    document.getElementById('cancel-recording').addEventListener('click', () => {
        closeVoiceRecorderModal();
    });
    
    document.getElementById('remove-voice').addEventListener('click', () => {
        voiceAttachedBlob = null;
        voiceAttachedBase64 = null;
        document.getElementById('voice-preview-container').classList.add('hidden');
    });

    // Submit Post
    document.getElementById('submit-post-btn').addEventListener('click', submitPost);
    
    // Lightbox triggers
    document.getElementById('close-lightbox').addEventListener('click', () => {
        document.getElementById('lightbox-modal').classList.add('hidden');
    });
}

// --- 5. POST SUBMISSION ---

function submitPost() {
    const postInput = document.getElementById('post-input');
    const content = postInput.value.trim();
    
    // Check if empty
    if (!content && !photoAttachedBase64 && !voiceAttachedBase64) {
        alert('請先輸入文字近況、拍照或錄製一段話！');
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
    
    const currentUser = USER_PROFILES[state.currentUser];
    
    const newPost = {
        id: 'post_' + Date.now(),
        author: state.currentUser,
        type: type,
        content: content || (type === 'photo' ? '分享了一張拍立得照片 ✨' : '留了一段語音悄悄話 🎧'),
        mediaData: mediaData,
        timestamp: timeString,
        mood: currentUser.mood,
        reactions: { love: [], hug: [], support: [], coffee: [] },
        comments: []
    };
    
    // Insert at top
    state.posts.unshift(newPost);
    savePostsToStorage();
    
    // If simulated user made a post, update their radar description too
    if (state.currentUser !== 'user_me') {
        state.friends[state.currentUser].status = content.substring(0, 15) + (content.length > 15 ? '...' : '');
        state.friends[state.currentUser].lastActive = '剛剛';
        saveFriendsToStorage();
    }
    
    // Reset fields
    postInput.value = '';
    photoAttachedBase64 = null;
    voiceAttachedBase64 = null;
    voiceAttachedBlob = null;
    
    document.getElementById('photo-preview-container').classList.add('hidden');
    document.getElementById('voice-preview-container').classList.add('hidden');
    document.getElementById('photo-input').value = '';
    
    // Render and refresh
    renderFeed(document.querySelector('.filter-btn.active').dataset.filter);
    renderFriendsList();
}

// --- 6. VOICE RECORDING LOGIC (MEDIARECORDER + WEB AUDIO SYNTH) ---

let mediaRecorder = null;
let audioChunks = [];
let recordTimerInterval = null;
let isRecording = false;

function openVoiceRecorderModal() {
    const modal = document.getElementById('voice-modal');
    modal.classList.remove('hidden');
    
    // Reset visualizer state
    document.getElementById('mic-icon').className = "fa-solid fa-microphone";
    document.getElementById('record-timer').textContent = "00:00";
    document.getElementById('recording-status').textContent = "點擊麥克風按鈕開始錄製 (限時10秒)";
    document.getElementById('save-recording').classList.add('hidden');
    modal.classList.remove('recording');
    
    const recordBtn = document.getElementById('record-action-btn');
    recordBtn.onclick = toggleRecording;
}

function closeVoiceRecorderModal() {
    stopRecording(false); // Stop if active
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
    
    if (useMock) {
        // Mock Audio Path
        console.log("Using Mock Audio");
        return;
    }
    
    // Access Microphone API
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
                
                // Stop all tracks to release microphone
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start();
        })
        .catch(err => {
            console.warn("Microphone access denied or error:", err);
            document.getElementById('use-mock-audio').checked = true;
            document.getElementById('recording-status').textContent = "系統已自動切換為語音模擬器（無麥克風權限）。";
        });
}

function stopRecording(keepData) {
    if (!isRecording) return;
    isRecording = false;
    
    clearInterval(recordTimerInterval);
    document.getElementById('voice-modal').classList.remove('recording');
    document.getElementById('mic-icon').className = "fa-solid fa-microphone";
    document.getElementById('recording-status').textContent = keepData ? "錄製完成！點擊按鈕保存" : "已取消";
    
    const useMock = document.getElementById('use-mock-audio').checked;
    
    if (useMock && keepData) {
        // Pre-fill a special mock identifier which will compile to synthetically synthesized notes on playback
        voiceAttachedBase64 = 'MOCK_SYNTH_AUDIO_' + Date.now();
        document.getElementById('save-recording').classList.remove('hidden');
    } else if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    
    // Save button trigger setup
    document.getElementById('save-recording').onclick = () => {
        if (voiceAttachedBase64) {
            // Update preview card in panel
            const voicePreview = document.getElementById('voice-preview-container');
            voicePreview.querySelector('.voice-duration').textContent = document.getElementById('record-timer').textContent;
            voicePreview.classList.remove('hidden');
            
            closeVoiceRecorderModal();
        }
    };
}

// --- 7. VOICE PLAYBACK CONTROL & WEB AUDIO SYNTHESIZER ---

let activeAudio = null;
let activeAudioId = null;
let synthInterval = null;

function togglePlayVoice(postId, mediaData) {
    const playerEl = document.getElementById(`voice-player-${postId}`);
    const playBtn = playerEl.querySelector('.voice-play-btn');
    const icon = playBtn.querySelector('i');
    const audioEl = document.getElementById(`audio-el-${postId}`);
    const timeSpan = playerEl.querySelector('.curr-time');
    
    // If clicking already active audio, pause it
    if (activeAudioId === postId) {
        pauseActiveAudio();
        return;
    }
    
    // Pause any other playing audio
    pauseActiveAudio();
    
    activeAudioId = postId;
    playerEl.classList.add('playing');
    icon.className = "fa-solid fa-pause";
    
    // Check if it's a simulated audio (Synthesizer Chimes)
    if (mediaData.startsWith('MOCK_')) {
        playSimulatedChimes(postId, playerEl, icon, timeSpan);
    } else {
        // Actual browser audio playback
        activeAudio = audioEl;
        audioEl.currentTime = 0;
        audioEl.play();
        
        audioEl.ontimeupdate = () => {
            const minutes = Math.floor(audioEl.currentTime / 60);
            const seconds = Math.floor(audioEl.currentTime % 60);
            timeSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        };
        
        audioEl.onended = () => {
            pauseActiveAudio();
        };
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
    
    // If actual browser audio element
    if (activeAudio) {
        activeAudio.pause();
        activeAudio.currentTime = 0;
        activeAudio = null;
    }
    
    // If simulation chime active
    if (synthInterval) {
        clearInterval(synthInterval);
        synthInterval = null;
    }
    
    activeAudioId = null;
}

// Generates warm, cozy synth bell chimes when playing a simulated note
function playSimulatedChimes(postId, playerEl, icon, timeSpan) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Play warm pentatonic scale chimes: G4, C5, D5, E5, G5, C6
    const notes = [392.00, 523.25, 587.33, 659.25, 783.99, 1046.50];
    let step = 0;
    const maxSteps = 10; // 10 seconds
    
    timeSpan.textContent = "0:00";
    
    // Custom timer
    synthInterval = setInterval(() => {
        step++;
        timeSpan.textContent = `0:${step.toString().padStart(2, '0')}`;
        
        // Synthesize single chimes
        if (step % 2 === 1) {
            const randomNote1 = notes[Math.floor(Math.random() * notes.length)];
            triggerSynthOscillator(audioCtx, randomNote1, 1.2);
        } else {
            const randomNote1 = notes[Math.floor(Math.random() * 3)];
            const randomNote2 = notes[Math.floor(Math.random() * 3) + 3];
            triggerSynthOscillator(audioCtx, randomNote1, 0.8);
            setTimeout(() => triggerSynthOscillator(audioCtx, randomNote2, 1.5), 180);
        }
        
        if (step >= maxSteps) {
            pauseActiveAudio();
        }
    }, 1000);
    
    // First immediate ring
    triggerSynthOscillator(audioCtx, notes[1], 1.5);
    setTimeout(() => triggerSynthOscillator(audioCtx, notes[4], 1.2), 250);
}

function triggerSynthOscillator(audioCtx, frequency, duration) {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    
    // Smooth attack and long warm decay
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.08); // 80ms attack
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration); // long decay
    
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

// --- 8. POST INTERACTIONS: REACTIONS & COMMENTS ---

function reactToPost(postId, reactionType) {
    const postIndex = state.posts.findIndex(p => p.id === postId);
    if (postIndex === -1) return;
    
    const post = state.posts[postIndex];
    if (!post.reactions) post.reactions = { love: [], hug: [], support: [], coffee: [] };
    
    const userList = post.reactions[reactionType] || [];
    const userIndex = userList.indexOf(state.currentUser);
    
    if (userIndex === -1) {
        // Add reaction
        userList.push(state.currentUser);
    } else {
        // Remove reaction
        userList.splice(userIndex, 1);
    }
    
    post.reactions[reactionType] = userList;
    savePostsToStorage();
    
    // Re-render only feed to update reaction numbers
    renderFeed(document.querySelector('.filter-btn.active').dataset.filter);
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
    
    const postIndex = state.posts.findIndex(p => p.id === postId);
    if (postIndex === -1) return;
    
    const newComment = {
        author: state.currentUser,
        text: text,
        timestamp: '剛剛'
    };
    
    if (!state.posts[postIndex].comments) {
        state.posts[postIndex].comments = [];
    }
    
    state.posts[postIndex].comments.push(newComment);
    savePostsToStorage();
    
    // Reset comment box
    inputEl.value = '';
    
    // Re-render feed
    renderFeed(document.querySelector('.filter-btn.active').dataset.filter);
    
    // Re-open and focus comment box if needed
    const commentBox = document.getElementById(`comment-box-${postId}`);
    commentBox.classList.remove('hidden');
}

// --- 9. UTILITY LIGHTBOX & ESCAPE HELPER ---

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

// Run Initializer on window load
window.addEventListener('DOMContentLoaded', initApp);
