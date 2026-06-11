/**
 * 우리동네 탐험기 - Core Game & UI Logic
 * Phaser 3 및 Vanilla JS 기반
 * 
 * 주요 기능:
 * 1. 계정 시스템 (회원가입, 로그인, 다중 계정 골드/가방 격리)
 * 2. 게이미피케이션 (4지선다 퀴즈 출제 및 해결, 필드 동적 골드 동전 스폰)
 * 3. 패션 상점 & 가방 인벤토리 (장신구 아바타 실시간 드로잉, 러닝슈즈 속도업, 무지개 흔적 이펙트)
 * 4. 2D 레트로 타운 탐험 (순간이동 미니맵, 모바일 패드, NPC 등록 및 대화)
 */

// ==========================================================================
// 1. 데이터베이스 관리자 (Google Apps Script API 백엔드)
// ==========================================================================

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzW3UnQ8Vucorq45jFVtnUrY6JjGlpfKcA_gbwQ2kiMWUbgoEPeJfyT5-bNYrsa4SsQ/exec';

// 실시간 동기화를 위해 메모리에 캐싱되는 데이터 배열들
let cachedUsers = [];
let cachedNPCs = [];
let cachedQuizzes = [];

let currentServer = null; // 선택된 서버 메타데이터 { id, name, owner }
let currentUser = null;   // 현재 로그인된 사용자 세션 데이터
let syncIntervalId = null; // 백그라운드 폴링 타이머 ID

// 상점 아이템 데이터베이스 정의
const SHOP_ITEMS = [
    // 액세서리
    { id: 'item_crown', name: '👑 황금 왕관', desc: '왕관의 권위로 상점에서 판매하는 모든 아이템이 20% 할인됩니다.', category: 'accessory', cost: 200 },
    { id: 'item_glasses', name: '😎 멋쟁이 선글라스', desc: '선글라스의 탐지 렌즈로 미니맵에 필드 동전/상자 위치가 실시간 표시됩니다.', category: 'accessory', cost: 100 },
    { id: 'item_halo', name: '😇 천사 링', desc: '천사의 가호로 5초마다 2G씩 자동으로 골드가 차오릅니다.', category: 'accessory', cost: 250 },
    { id: 'item_balloon', name: '🎈 빨간 풍선', desc: '풍선을 타고 몸이 가벼워져 배가 없어도 물(호수/강) 위를 떠다닙니다.', category: 'accessory', cost: 150 },
    { id: 'item_bunny', name: '🐰 토끼 머리띠', desc: '대시 기능 잠금 해제! Shift(데스크톱) 또는 Dash버튼(모바일)으로 3초 쿨타임 대시를 씁니다.', category: 'accessory', cost: 180 },
    { id: 'item_flower', name: '🌸 벚꽃 핀', desc: '벚꽃의 따뜻한 온기로 NPC와의 대화 완료 골드 보상이 2배로 증가합니다.', category: 'accessory', cost: 130 },
    { id: 'item_cat', name: '🐱 고양이 꼬리', desc: '고양이의 민첩성으로 이동 속도가 상시 +30 증가합니다.', category: 'accessory', cost: 220 },
    { id: 'item_star_wand', name: '⭐ 별빛 지팡이', desc: '15초마다 플레이어 근처에 보너스 동전/별이 1개 추가 스폰됩니다.', category: 'accessory', cost: 280 },
    { id: 'item_scarf', name: '🧣 빨간 목도리', desc: '목도리의 보온 효과로, FantasyForestScene(차원 숲)의 마법의 별 골드 획득량이 +15G 증가합니다.', category: 'accessory', cost: 120 },
    { id: 'item_backpack', name: '🎒 탐험가 배낭', desc: '선물 상자에서 획득하는 모든 버프 지속 시간이 2배로 증가합니다 (15초 → 30초).', category: 'accessory', cost: 190 },
    // 업그레이드
    { id: 'item_shoes', name: '👟 러닝 슈즈', desc: '이동 속도가 대폭 빨라집니다. (기본 속도 120 → 180)', category: 'upgrade', cost: 300 },
    { id: 'item_trail_rainbow', name: '✨ 무지개 흔적', desc: '달릴 때마다 발밑에 아름다운 무지개색 불꽃을 남깁니다.', category: 'upgrade', cost: 400 },
    { id: 'item_trail_snow', name: '❄️ 눈꽃 흔적', desc: '발걸음마다 하얀 눈꽃 결정이 피어납니다.', category: 'upgrade', cost: 350 },
    { id: 'item_aura_spark', name: '⚡ 번개 오라', desc: '몸 주변에 지속적으로 번개 아우라가 맴돕니다.', category: 'upgrade', cost: 500 },
    { id: 'item_aura_fire', name: '🔥 불꽃 오라', desc: '타오르는 불꽃 오라를 발산하며, 퀴즈 정답 시 획득 골드가 50% 보너스 증가합니다.', category: 'upgrade', cost: 480 },
    { id: 'item_aura_ice', name: '🧊 얼음 오라', desc: '신비로운 얼음 오라를 발산하며, 상점 구매 시 추가로 10% 할인을 받습니다 (왕관 중첩 가능).', category: 'upgrade', cost: 460 },
    { id: 'item_lucky_coin', name: '🍀 행운의 동전', desc: '동전 획득 시 추가 보너스 골드를 얻습니다. (+50%)', category: 'upgrade', cost: 600 },
    { id: 'item_boat_pass', name: '⛵ 뱃사람 증명서', desc: '호수에서 배를 타고 자유롭게 이동할 수 있습니다.', category: 'upgrade', cost: 700 },
];

// 기본 NPC 데이터 (최초 로드 시 적용)
const DEFAULT_NPCS = [
    {
        id: 'npc_default_1',
        name: '경비 아저씨',
        role: '온누리 아파트 지킴이',
        spriteStyle: {
            gender: 'male',
            skinColor: '#ffd59a',
            hairColor: '#455a64',
            outfitColor: '#1a237e'
        },
        dialogues: [
            "허허, 안녕들 하신가! 오늘도 활기찬 하루군.",
            "이 동네를 순찰한 지도 벌써 10년이 다 되어가는구만.",
            "혹시 놀이터 옆길에서 쓰레기를 보면 줍는 착한 학생이 되어주렴!"
        ],
        mapX: 20,
        mapY: 18,
        createdAt: new Date().toISOString()
    },
    {
        id: 'npc_default_2',
        name: '붕어빵 사장님',
        role: '동네 최고의 간식 요리사',
        spriteStyle: {
            gender: 'female',
            skinColor: '#ffdbac',
            hairColor: '#3e2723',
            outfitColor: '#d84315'
        },
        dialogues: [
            "어서 와요! 방금 구운 따끈따끈한 황금 붕어빵이랍니다.",
            "우리 동네 애들은 슈크림보다 팥 붕어빵을 더 좋아하더라고.",
            "추운 겨울이 아니어도 붕어빵은 언제나 사랑받지, 호호!"
        ],
        mapX: 28,
        mapY: 35,
        createdAt: new Date().toISOString()
    },
    {
        id: 'npc_default_3',
        name: '담임 선생님',
        role: '우리동네 초등학교 교사',
        spriteStyle: {
            gender: 'female',
            skinColor: '#f1c27d',
            hairColor: '#5c4033',
            outfitColor: '#4caf50'
        },
        dialogues: [
            "오늘 배운 내용은 잊지 않고 복습하고 있나요?",
            "공부도 중요하지만 친구들과 사이좋게 지내는 것도 중요하답니다.",
            "수업 시간에 늦지 않도록 서둘러 등교하도록 해요!"
        ],
        mapX: 45,
        mapY: 20,
        createdAt: new Date().toISOString()
    }
];

// 기본 퀴즈 데이터
const DEFAULT_QUIZZES = [
    {
        id: 'quiz_default_1',
        creator: '시스템',
        question: '우리 동네 아파트 단지의 이름은 무엇일까요?',
        options: ['온누리 아파트', '그린 아파트', '하늘 아파트', '강변 아파트'],
        correctIndex: 0,
        reward: 30
    },
    {
        id: 'quiz_default_2',
        creator: '시스템',
        question: '붕어빵 사장님이 판매하는 가장 인기 있는 붕어빵 맛은?',
        options: ['팥 붕어빵', '슈크림 붕어빵', '피자 붕어빵', '고구마 붕어빵'],
        correctIndex: 0,
        reward: 30
    },
    {
        id: 'quiz_default_3',
        creator: '시스템',
        question: '경비 아저씨가 지키고 계신 곳은 어디일까요?',
        options: ['아파트 입구 경비실', '초등학교 교문', '붕어빵 가게 앞', '중앙 공원 분수대'],
        correctIndex: 0,
        reward: 30
    }
];

// API Queue 시스템 (시트 쓰기 요청 순차 처리 및 레이스 컨디션 차단)
const apiQueue = [];
let isProcessingQueue = false;

async function callAPI(action, data = {}) {
    const payload = { action, data };
    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result && result.status === 'success') {
            return result.data;
        } else {
            throw new Error(result ? result.error || result.message : 'Unknown API error');
        }
    } catch (e) {
        console.error(`API Error on action [${action}]:`, e);
        throw e;
    }
}

async function enqueueAPI(action, data) {
    return new Promise((resolve, reject) => {
        apiQueue.push({ action, data, resolve, reject });
        processQueue();
    });
}

async function processQueue() {
    if (isProcessingQueue || apiQueue.length === 0) return;
    isProcessingQueue = true;
    while (apiQueue.length > 0) {
        const { action, data, resolve, reject } = apiQueue.shift();
        try {
            const res = await callAPI(action, data);
            resolve(res);
        } catch (e) {
            reject(e);
        }
    }
    isProcessingQueue = false;
}

// 백그라운드 15초 주기 remote 데이터 동기화
async function startBackgroundSync() {
    if (syncIntervalId) clearInterval(syncIntervalId);
    syncIntervalId = setInterval(async () => {
        if (!currentServer || !currentUser) return;
        try {
            await syncRemoteData();
        } catch (e) {
            console.error("Background sync error:", e);
        }
    }, 15000);
}

async function syncRemoteData() {
    if (!currentServer || !currentUser) return;
    
    const [usersRes, npcsRes, quizzesRes] = await Promise.all([
        callAPI('getUsers', { serverId: currentServer.id }),
        callAPI('getNPCs', { serverId: currentServer.id }),
        callAPI('getQuizzes', { serverId: currentServer.id })
    ]);
    
    cachedUsers = usersRes.users || [];
    cachedNPCs = npcsRes.npcs || [];
    cachedQuizzes = quizzesRes.quizzes || [];
    
    // 현재 사용자 상태 동기화 및 만료/삭제 로그아웃 처리
    const updatedUser = cachedUsers.find(u => u.username === currentUser.username);
    if (!updatedUser) {
        alert('계정이 삭제되었거나 정보가 유효하지 않아 로그아웃됩니다.');
        logoutUserForcefully();
        return;
    }
    
    const goldChanged = currentUser.gold !== updatedUser.gold;
    currentUser = updatedUser;
    
    document.getElementById('hud-user-name').innerText = currentUser.username;
    document.getElementById('hud-user-gold').innerText = currentUser.gold;
    
    if (!document.getElementById('shop-modal').classList.contains('hidden')) {
        loadShopItems();
    }
    if (!document.getElementById('inventory-modal').classList.contains('hidden')) {
        loadInventoryItems();
    }
    if (!document.getElementById('admin-modal').classList.contains('hidden')) {
        const activeTab = document.querySelector('.admin-tab.active');
        if (activeTab) activeTab.click(); // 대시보드 강제 렌더링 유도
    }
    
    if (gameInstance && gameInstance.scene.isActive('WorldScene')) {
        gameInstance.scene.getScene('WorldScene').refreshPlayerSkin();
    }
    
    if (goldChanged) {
        showHUDMessage(`💰 보유 골드가 동기화되었습니다: ${currentUser.gold}G`);
    }
    
    // UI 업데이트
    updateSidebarNPCList();
    updateQuizListUI();
    if (gameInstance && gameInstance.scene.isActive('WorldScene')) {
        gameInstance.scene.getScene('WorldScene').spawnNPCs();
    }
    drawMinimap();
}

function getUsers() {
    return cachedUsers;
}

function getNPCs() {
    return cachedNPCs;
}

function getQuizzes() {
    return cachedQuizzes;
}

async function saveQuiz(quiz) {
    const existingIdx = cachedQuizzes.findIndex(q => q.id === quiz.id);
    if (existingIdx !== -1) {
        cachedQuizzes[existingIdx] = quiz;
    } else {
        cachedQuizzes.push(quiz);
    }
    
    updateQuizListUI();
    
    try {
        await enqueueAPI('saveQuiz', { serverId: currentServer.id, quiz: quiz });
    } catch (e) {
        console.error("Failed to save quiz remotely:", e);
    }
}


async function syncCurrentUser() {
    if (!currentUser || !currentServer) return;
    
    // 로컬 즉시 갱신 (Optimistic Update)
    const idx = cachedUsers.findIndex(u => u.username === currentUser.username);
    if (idx !== -1) {
        cachedUsers[idx] = JSON.parse(JSON.stringify(currentUser));
    }
    
    document.getElementById('hud-user-name').innerText = currentUser.username;
    document.getElementById('hud-user-gold').innerText = currentUser.gold;

    const isOwner = currentUser && currentServer && currentUser.username === currentServer.owner;
    const btnAdmin = document.getElementById('btn-open-admin');
    if (btnAdmin) {
        if (isOwner) {
            btnAdmin.classList.remove('hidden');
        } else {
            btnAdmin.classList.add('hidden');
        }
    }
    
    try {
        await enqueueAPI('saveUser', { serverId: currentServer.id, user: currentUser });
    } catch (e) {
        console.error("Failed to save user remotely:", e);
    }
}

// 비밀번호 해시화 모방 (교육용 클라이언트 수준 암호화)
function hashPassword(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return 'user_pw_' + Math.abs(hash);
}

function initLocalStorage() {}
function initServerLocalStorage() {}



// ==========================================================================
// 2. 도트 그래픽 절차적 생성 엔진 (Dynamic Pixel Textures)
// ==========================================================================

const TILE_SIZE = 32;

// 캔버스에 픽셀 캐릭터 및 장착 장신구 렌더링
function drawPixelCharacter(ctx, style = {}, direction = 'down', equipped = []) {
    const skinColor = style.skinColor || '#ffdbac';
    const hairColor = style.hairColor || '#5d4037';
    const outfitColor = style.outfitColor || '#37474f';
    const gender = style.gender || 'male';
    
    ctx.clearRect(0, 0, 32, 32);
    
    function drawPixelRect(x, y, w, h, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x * 2, y * 2, w * 2, h * 2);
    }

    // 0. 고양이 꼬리 그리기 (꼬리는 몸통 뒤에 있으므로 최우선 렌더링)
    if (equipped.includes('item_cat')) {
        if (direction === 'left') {
            drawPixelRect(10, 10, 2, 1, '#4e342e');
            drawPixelRect(11, 8, 1, 2, '#4e342e');
            drawPixelRect(12, 7, 2, 1, '#4e342e');
        } else if (direction === 'right') {
            drawPixelRect(4, 10, 2, 1, '#4e342e');
            drawPixelRect(3, 8, 1, 2, '#4e342e');
            drawPixelRect(1, 7, 2, 1, '#4e342e');
        } else if (direction === 'up') {
            drawPixelRect(10, 9, 2, 1, '#4e342e');
            drawPixelRect(11, 7, 1, 2, '#4e342e');
            drawPixelRect(12, 6, 2, 1, '#4e342e');
        } else { // down
            drawPixelRect(2, 9, 2, 1, '#4e342e');
            drawPixelRect(1, 7, 1, 2, '#4e342e');
            drawPixelRect(0, 6, 2, 1, '#4e342e');
        }
    }

    // 1. 풍선 끈 그리기 (손잡이 위치부터 연결)
    if (equipped.includes('item_balloon')) {
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // 풍선 위치: x=2, y=3 주변 / 손 위치: x=13, y=8 주변
        ctx.moveTo(4, 8);
        ctx.quadraticCurveTo(10, 12, direction === 'left' ? 14 : 26, 18);
        ctx.stroke();
    }

    // 2. 다리 / 신발 (하단 y=13~15)
    if (direction === 'left' || direction === 'right') {
        drawPixelRect(6, 13, 4, 3, '#37474f');
    } else {
        drawPixelRect(4, 13, 3, 3, '#37474f');
        drawPixelRect(9, 13, 3, 3, '#37474f');
    }

    // 3. 몸통 / 옷 (y=7~12)
    if (direction === 'left') {
        drawPixelRect(5, 7, 5, 6, outfitColor);
        drawPixelRect(6, 7, 2, 4, skinColor);
    } else if (direction === 'right') {
        drawPixelRect(6, 7, 5, 6, outfitColor);
        drawPixelRect(8, 7, 2, 4, skinColor);
    } else {
        drawPixelRect(4, 7, 8, 6, outfitColor);
        drawPixelRect(2, 7, 2, 5, skinColor);
        drawPixelRect(12, 7, 2, 5, skinColor);
    }

    // 4. 머리 / 피부 (y=2~6)
    drawPixelRect(4, 2, 8, 5, skinColor);

    // 5. 얼굴 눈 (y=4)
    if (direction === 'down') {
        drawPixelRect(5, 4, 1, 1, '#000000');
        drawPixelRect(10, 4, 1, 1, '#000000');
        drawPixelRect(7, 5, 2, 1, '#e57373'); // 볼터치
    } else if (direction === 'left') {
        drawPixelRect(5, 4, 1, 1, '#000000');
    } else if (direction === 'right') {
        drawPixelRect(10, 4, 1, 1, '#000000');
    }

    // 6. 머리카락 (y=1~3)
    if (gender === 'female') {
        drawPixelRect(3, 1, 10, 2, hairColor);
        if (direction === 'down') {
            drawPixelRect(3, 2, 2, 4, hairColor);
            drawPixelRect(11, 2, 2, 4, hairColor);
            drawPixelRect(5, 2, 6, 1, hairColor);
        } else if (direction === 'up') {
            drawPixelRect(3, 2, 10, 5, hairColor);
        } else if (direction === 'left') {
            drawPixelRect(4, 2, 6, 5, hairColor);
            drawPixelRect(9, 2, 2, 4, hairColor);
        } else if (direction === 'right') {
            drawPixelRect(6, 2, 6, 5, hairColor);
            drawPixelRect(5, 2, 2, 4, hairColor);
        }
    } else {
        drawPixelRect(3, 1, 10, 2, hairColor);
        if (direction === 'down') {
            drawPixelRect(3, 2, 1, 2, hairColor);
            drawPixelRect(12, 2, 1, 2, hairColor);
            drawPixelRect(4, 2, 8, 1, hairColor);
        } else if (direction === 'up') {
            drawPixelRect(3, 2, 10, 4, hairColor);
        } else if (direction === 'left') {
            drawPixelRect(4, 2, 7, 2, hairColor);
            drawPixelRect(4, 3, 2, 1, hairColor);
        } else if (direction === 'right') {
            drawPixelRect(5, 2, 7, 2, hairColor);
            drawPixelRect(10, 3, 2, 1, hairColor);
        }
    }

    // ==========================================
    // [장신구 장착 데코레이션 그리기]
    // ==========================================
    
    // 멋쟁이 선글라스 (Sunglasses)
    if (equipped.includes('item_glasses') && direction !== 'up') {
        if (direction === 'down') {
            drawPixelRect(4, 4, 3, 1, '#1e293b');
            drawPixelRect(9, 4, 3, 1, '#1e293b');
            drawPixelRect(7, 4, 2, 1, '#475569'); // 코받침 브릿지
        } else if (direction === 'left') {
            drawPixelRect(4, 4, 4, 1, '#1e293b');
        } else if (direction === 'right') {
            drawPixelRect(8, 4, 4, 1, '#1e293b');
        }
    }

    // 황금 왕관 (Crown)
    if (equipped.includes('item_crown')) {
        // 머리 윗부분에 황금 왕관 픽셀 배치
        drawPixelRect(5, 1, 6, 1, '#ffd54f'); // 왕관 밑단
        drawPixelRect(5, 0, 1, 1, '#ffd54f'); // 뾰족이 좌
        drawPixelRect(7, 0, 2, 1, '#ffd54f'); // 뾰족이 중
        drawPixelRect(10, 0, 1, 1, '#ffd54f'); // 뾰족이 우
        
        // 왕관 가운데 보석 도트
        drawPixelRect(7, 1, 1, 1, '#ef5350'); // 빨간 보석
        drawPixelRect(9, 1, 1, 1, '#29b6f6'); // 파란 보석
    }

    // 천사 링 (Halo)
    if (equipped.includes('item_halo')) {
        // 머리 위 공중에 뜨는 천사링
        drawPixelRect(5, -1, 6, 1, '#fff59d'); // 중심 링
        drawPixelRect(4, -1, 1, 1, '#ffd54f');
        drawPixelRect(11, -1, 1, 1, '#ffd54f');
    }

    // 빨간 풍선 (Balloon)
    if (equipped.includes('item_balloon')) {
        // 둥실 떠다니는 풍선 구체
        drawPixelRect(1, 1, 3, 3, '#e53935'); // 풍선 몸체
        drawPixelRect(2, 0, 1, 1, '#e53935');
        drawPixelRect(2, 4, 1, 1, '#d32f2f'); // 풍선 꼬리 묶음
        drawPixelRect(3, 1, 1, 1, '#ff8a80'); // 풍선 빛 하이라이트
    }

    // 🐰 토끼 머리띠 (Bunny Ears)
    if (equipped.includes('item_bunny')) {
        // Left Ear
        drawPixelRect(4, 0, 1, 2, '#ffffff');
        drawPixelRect(5, 0, 1, 2, '#ff8a80'); // pink inner
        drawPixelRect(6, 0, 1, 2, '#ffffff');
        
        // Right Ear
        drawPixelRect(8, 0, 1, 2, '#ffffff');
        drawPixelRect(9, 0, 1, 2, '#ff8a80'); // pink inner
        drawPixelRect(10, 0, 1, 2, '#ffffff');
    }

    // 🌸 벚꽃 핀 (Cherry Blossom Pin)
    if (equipped.includes('item_flower')) {
        if (direction === 'left') {
            drawPixelRect(5, 2, 2, 2, '#f472b6'); // pink petals
            drawPixelRect(6, 3, 1, 1, '#fef08a'); // yellow center
        } else if (direction === 'right') {
            drawPixelRect(9, 2, 2, 2, '#f472b6');
            drawPixelRect(9, 3, 1, 1, '#fef08a');
        } else if (direction === 'down') {
            drawPixelRect(10, 2, 2, 2, '#f472b6');
            drawPixelRect(10, 3, 1, 1, '#fef08a');
        }
    }
}

// Phaser 캐릭터 다방향 텍스처 등록
function generateCharacterTextureCache(scene, key, style, equipped = []) {
    const directions = ['down', 'up', 'left', 'right'];
    
    if (scene.textures.exists(key)) {
        const texture = scene.textures.get(key);
        const ctx = texture.context;
        ctx.clearRect(0, 0, 128, 32);
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 32;
        tempCanvas.height = 32;
        const tempCtx = tempCanvas.getContext('2d');
        
        directions.forEach((dir, index) => {
            drawPixelCharacter(tempCtx, style, dir, equipped);
            ctx.drawImage(tempCanvas, index * 32, 0);
        });
        
        texture.refresh();
        return;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 32;
    tempCanvas.height = 32;
    const tempCtx = tempCanvas.getContext('2d');
    
    directions.forEach((dir, index) => {
        drawPixelCharacter(tempCtx, style, dir, equipped);
        ctx.drawImage(tempCanvas, index * 32, 0);
    });
    
    scene.textures.addCanvas(key, canvas);
    const texture = scene.textures.get(key);
    
    texture.add('down', 0, 0, 0, 32, 32);
    texture.add('up', 0, 32, 0, 32, 32);
    texture.add('left', 0, 64, 0, 32, 32);
    texture.add('right', 0, 96, 0, 32, 32);
}

// 월드 맵 타일 및 아이템 텍스처 생성
function generateMapTiles(scene) {
    if (scene.textures.exists('tile-grass')) return;

    // [기존 타일 생성 유지]
    const grass = scene.textures.createCanvas('tile-grass', TILE_SIZE, TILE_SIZE);
    const gCtx = grass.context;
    gCtx.fillStyle = '#7cb342';
    gCtx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    gCtx.fillStyle = '#689f38';
    gCtx.fillRect(4, 6, 2, 2); gCtx.fillRect(20, 8, 2, 2); gCtx.fillRect(12, 20, 2, 2);
    grass.refresh();

    const flower = scene.textures.createCanvas('tile-flower', TILE_SIZE, TILE_SIZE);
    const fCtx = flower.context;
    fCtx.fillStyle = '#7cb342';
    fCtx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    fCtx.fillStyle = '#fbc02d';
    fCtx.fillRect(10, 10, 4, 4);
    flower.refresh();

    const brick = scene.textures.createCanvas('tile-brick', TILE_SIZE, TILE_SIZE);
    const bCtx = brick.context;
    bCtx.fillStyle = '#b0bec5';
    bCtx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    bCtx.fillStyle = '#cfd8dc';
    bCtx.fillRect(2, 2, 28, 12); bCtx.fillRect(2, 16, 12, 12); bCtx.fillRect(16, 16, 14, 12);
    brick.refresh();

    const water = scene.textures.createCanvas('tile-water', TILE_SIZE, TILE_SIZE);
    const wCtx = water.context;
    wCtx.fillStyle = '#0288d1';
    wCtx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    wCtx.fillStyle = '#29b6f6';
    wCtx.fillRect(4, 8, 12, 2);
    water.refresh();

    const boat = scene.textures.createCanvas('obj-boat', 32, 32);
    const btCtx = boat.context;
    btCtx.fillStyle = '#8b5a2b'; // Wood color
    btCtx.beginPath();
    btCtx.ellipse(16, 16, 14, 10, 0, 0, Math.PI * 2);
    btCtx.fill();
    btCtx.fillStyle = '#fef08a'; // Inner boat
    btCtx.beginPath();
    btCtx.ellipse(16, 16, 10, 6, 0, 0, Math.PI * 2);
    btCtx.fill();
    boat.refresh();

    const dock = scene.textures.createCanvas('obj-dock', 32, 32);
    const dkCtx = dock.context;
    dkCtx.fillStyle = '#5d4037';
    dkCtx.fillRect(0, 0, 32, 32);
    dkCtx.fillStyle = '#3e2723';
    dkCtx.fillRect(0, 6, 32, 2);
    dkCtx.fillRect(0, 16, 32, 2);
    dkCtx.fillRect(0, 26, 32, 2);
    dock.refresh();

    const tree = scene.textures.createCanvas('obj-tree', 32, 48);
    const tCtx = tree.context;
    tCtx.fillStyle = '#5d4037'; tCtx.fillRect(12, 30, 8, 18);
    tCtx.fillStyle = '#2e7d32';
    tCtx.beginPath(); tCtx.arc(16, 18, 14, 0, Math.PI * 2); tCtx.fill();
    tCtx.beginPath(); tCtx.arc(16, 28, 12, 0, Math.PI * 2); tCtx.fill();
    tree.refresh();

    const treeApple = scene.textures.createCanvas('obj-tree-apple', 32, 48);
    const taCtx = treeApple.context;
    taCtx.fillStyle = '#5d4037'; taCtx.fillRect(12, 30, 8, 18);
    taCtx.fillStyle = '#2e7d32';
    taCtx.beginPath(); taCtx.arc(16, 18, 14, 0, Math.PI * 2); taCtx.fill();
    taCtx.beginPath(); taCtx.arc(16, 28, 12, 0, Math.PI * 2); taCtx.fill();
    taCtx.fillStyle = '#e53935'; // 사과
    taCtx.beginPath(); taCtx.arc(9, 16, 3, 0, Math.PI * 2); taCtx.fill();
    taCtx.beginPath(); taCtx.arc(23, 19, 3, 0, Math.PI * 2); taCtx.fill();
    treeApple.refresh();

    // 건물들
    const house = scene.textures.createCanvas('obj-house', 96, 80);
    const hCtx = house.context;
    hCtx.fillStyle = '#ffe082'; hCtx.fillRect(8, 32, 80, 48);
    hCtx.fillStyle = '#e53935'; hCtx.beginPath(); hCtx.moveTo(48, 2); hCtx.lineTo(0, 32); hCtx.lineTo(96, 32); hCtx.closePath(); hCtx.fill();
    hCtx.fillStyle = '#795548'; hCtx.fillRect(38, 52, 20, 28);
    house.refresh();

    const houseBlue = scene.textures.createCanvas('obj-house-blue', 96, 80);
    const hbCtx = houseBlue.context;
    hbCtx.fillStyle = '#eceff1'; hbCtx.fillRect(8, 32, 80, 48);
    hbCtx.fillStyle = '#1e88e5'; hbCtx.beginPath(); hbCtx.moveTo(48, 2); hbCtx.lineTo(0, 32); hbCtx.lineTo(96, 32); hbCtx.closePath(); hbCtx.fill();
    hbCtx.fillStyle = '#5d4037'; hbCtx.fillRect(38, 52, 20, 28);
    houseBlue.refresh();

    const houseGreen = scene.textures.createCanvas('obj-house-green', 96, 80);
    const hgCtx = houseGreen.context;
    hgCtx.fillStyle = '#a1887f'; hgCtx.fillRect(8, 32, 80, 48);
    hgCtx.fillStyle = '#2e7d32'; hgCtx.beginPath(); hgCtx.moveTo(48, 2); hgCtx.lineTo(0, 32); hgCtx.lineTo(96, 32); hgCtx.closePath(); hgCtx.fill();
    hgCtx.fillStyle = '#3e2723'; hgCtx.fillRect(38, 52, 20, 28);
    houseGreen.refresh();

    const mart = scene.textures.createCanvas('obj-mart', 128, 80);
    const mCtx = mart.context;
    mCtx.fillStyle = '#f5f5f5'; mCtx.fillRect(8, 24, 112, 56);
    mCtx.fillStyle = '#757575'; mCtx.fillRect(4, 16, 120, 8);
    for (let ax = 6; ax < 122; ax += 10) {
        mCtx.fillStyle = (Math.floor(ax / 10) % 2 === 0) ? '#e53935' : '#ffffff';
        mCtx.fillRect(ax, 24, 10, 8);
    }
    mCtx.fillStyle = '#b0bec5'; mCtx.fillRect(52, 44, 24, 36);
    mart.refresh();

    const fountain = scene.textures.createCanvas('obj-fountain', 64, 64);
    const foCtx = fountain.context;
    foCtx.fillStyle = '#90a4ae'; foCtx.beginPath(); foCtx.arc(32, 44, 20, 0, Math.PI * 2); foCtx.fill();
    foCtx.fillStyle = '#29b6f6'; foCtx.beginPath(); foCtx.arc(32, 44, 14, 0, Math.PI * 2); foCtx.fill();
    foCtx.fillStyle = '#78909c'; foCtx.fillRect(28, 22, 8, 20);
    fountain.refresh();

    const bench = scene.textures.createCanvas('obj-bench', 48, 32);
    const beCtx = bench.context;
    beCtx.fillStyle = '#a1887f'; beCtx.fillRect(4, 17, 40, 4); beCtx.fillRect(4, 22, 40, 4);
    beCtx.fillStyle = '#263238'; beCtx.fillRect(6, 14, 4, 14); beCtx.fillRect(38, 14, 4, 14);
    bench.refresh();

    const streetlight = scene.textures.createCanvas('obj-streetlight', 32, 64);
    const slCtx = streetlight.context;
    slCtx.fillStyle = '#37474f'; slCtx.fillRect(14, 16, 4, 44);
    slCtx.fillStyle = '#ffd54f'; slCtx.beginPath(); slCtx.arc(10, 22, 5, 0, Math.PI * 2); slCtx.fill();
    streetlight.refresh();

    const fence = scene.textures.createCanvas('obj-fence', 32, 32);
    const feCtx = fence.context;
    feCtx.fillStyle = '#d7ccc8'; feCtx.fillRect(0, 10, 32, 3);
    feCtx.fillStyle = '#efebe9';
    for (let px = 2; px < 32; px += 8) { feCtx.fillRect(px, 5, 4, 25); }
    fence.refresh();

    // 12. 황금 동전 텍스처 (돌발 획득 아이템) (16x16)
    const coin = scene.textures.createCanvas('obj-coin', 16, 16);
    const cCtx = coin.context;
    cCtx.fillStyle = '#ffd54f'; // 황금색
    cCtx.strokeStyle = '#f57f17';
    cCtx.lineWidth = 1;
    cCtx.beginPath();
    cCtx.arc(8, 8, 6, 0, Math.PI * 2);
    cCtx.fill();
    cCtx.stroke();
    // 동전 하이라이트 반짝임
    cCtx.fillStyle = '#ffffff';
    cCtx.fillRect(6, 5, 2, 2);
    coin.refresh();
}


// ==========================================================================
// 3. 월드 맵 설계 데이터 (60 x 60 Grid)
// ==========================================================================

const MAP_WIDTH = 100;
const MAP_HEIGHT = 100;

let mapData = [];
let obstaclesMap = [];

// 호수 정의 (좌표와 반경) - 보트 탑승 시 통과 가능
const LAKE_REGIONS = [
    { cx: 47.5, cy: 11.5, radius: 9 },  // 북동쪽 큰 호수
    { cx: 75, cy: 20, radius: 8 },       // 동쪽 신규 호수
    { cx: 20, cy: 75, radius: 7 },       // 남서쪽 신규 호수
];

function isInLake(gx, gy) {
    for (const lake of LAKE_REGIONS) {
        if (Math.abs(gy - lake.cy) + Math.abs(gx - lake.cx) < lake.radius) return true;
    }
    return false;
}

function initMapGrid() {
    mapData = Array(MAP_HEIGHT).fill(null).map(() => Array(MAP_WIDTH).fill(0));
    obstaclesMap = Array(MAP_HEIGHT).fill(null).map(() => Array(MAP_WIDTH).fill(0));
    
    // 꽃 장식 (랜덤)
    for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
            if (Math.random() < 0.10) mapData[y][x] = 1;
        }
    }

    // 메인 도로 (십자 + 광장)
    for (let y = 2; y < MAP_HEIGHT - 2; y++) {
        mapData[y][49] = 2; mapData[y][50] = 2; mapData[y][51] = 2;
        mapData[y][29] = 2; mapData[y][30] = 2; mapData[y][31] = 2;
    }
    for (let x = 2; x < MAP_WIDTH - 2; x++) {
        mapData[49][x] = 2; mapData[50][x] = 2; mapData[51][x] = 2;
        mapData[29][x] = 2; mapData[30][x] = 2; mapData[31][x] = 2;
    }
    // 중앙 광장
    for (let y = 24; y <= 35; y++) {
        for (let x = 24; x <= 35; x++) mapData[y][x] = 2;
    }
    // 동쪽 광장
    for (let y = 44; y <= 55; y++) {
        for (let x = 44; x <= 55; x++) mapData[y][x] = 2;
    }
    // 북동 골목길
    for (let y = 5; y < 25; y++) {
        mapData[y][60] = 2; mapData[y][61] = 2;
    }
    // 남쪽 마을 연결로
    for (let x = 55; x < 85; x++) {
        mapData[70][x] = 2; mapData[71][x] = 2;
    }
    // 북서 공원 산책로
    for (let y = 5; y < 20; y++) {
        mapData[y][15] = 2; mapData[y][16] = 2;
    }
    for (let x = 5; x < 20; x++) {
        mapData[15][x] = 2; mapData[16][x] = 2;
    }

    // 호수들 (obstacle=1 설정, 보트 없으면 통과 불가)
    for (const lake of LAKE_REGIONS) {
        for (let y = Math.floor(lake.cy - lake.radius - 2); y < Math.ceil(lake.cy + lake.radius + 2); y++) {
            for (let x = Math.floor(lake.cx - lake.radius - 2); x < Math.ceil(lake.cx + lake.radius + 2); x++) {
                if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
                    if (Math.abs(y - lake.cy) + Math.abs(x - lake.cx) < lake.radius) {
                        mapData[y][x] = 3; obstaclesMap[y][x] = 1;
                    }
                }
            }
        }
    }

    // 남서쪽 연못 (소형)
    for (let y = 43; y < 50; y++) {
        for (let x = 7; x < 16; x++) {
            if (Math.abs(y - 46) + Math.abs(x - 11) < 5) {
                mapData[y][x] = 3; obstaclesMap[y][x] = 1;
            }
        }
    }
    // 북서쪽 공원 연못
    for (let y = 6; y < 13; y++) {
        for (let x = 6; x < 13; x++) {
            if (Math.abs(y - 9.5) + Math.abs(x - 9.5) < 4) {
                mapData[y][x] = 3; obstaclesMap[y][x] = 1;
            }
        }
    }
    // 동쪽 시냇물
    for (let y = 18; y < 90; y++) {
        let waveX = 85 + Math.floor(Math.sin(y * 0.35) * 2.5);
        for (let x = waveX - 1; x <= waveX + 1; x++) {
            if (x >= 0 && x < MAP_WIDTH) {
                mapData[y][x] = 3; obstaclesMap[y][x] = 1;
            }
        }
    }
    // 남부 강
    for (let x = 5; x < 95; x++) {
        const waveY = 90 + Math.floor(Math.sin(x * 0.3) * 1.5);
        for (let dy = -1; dy <= 2; dy++) {
            const fy = waveY + dy;
            if (fy >= 0 && fy < MAP_HEIGHT) {
                mapData[fy][x] = 3; obstaclesMap[fy][x] = 1;
            }
        }
    }

    // 테두리 벽
    for (let x = 0; x < MAP_WIDTH; x++) {
        obstaclesMap[0][x] = 1; obstaclesMap[MAP_HEIGHT - 1][x] = 1;
    }
    for (let y = 0; y < MAP_HEIGHT; y++) {
        obstaclesMap[y][0] = 1; obstaclesMap[y][MAP_WIDTH - 1] = 1;
    }
}


// ==========================================================================
// 4. Phaser Game Scene - WorldScene
// ==========================================================================

class WorldScene extends Phaser.Scene {
    constructor() {
        super('WorldScene');
        this.player = null;
        this.cursors = null;
        this.wasd = null;
        this.npcGroup = null;
        this.npcSprites = {};
        this.isInteracting = false;
        this.activeNpc = null;
        this.interactionPrompt = null;
        
        // 돌발 골드 스폰 그룹
        this.coinsGroup = null;
    }

    init(data) {
        this.spawnCoords = data;
        this.isInteracting = false;
    }

    preload() {
        generateMapTiles(this);
        
        const playerStyle = currentUser ? currentUser.spriteStyle : {
            gender: 'male', skinColor: '#ffdbac', hairColor: '#f44336', outfitColor: '#00bcd4'
        };
        const equipped = currentUser ? currentUser.equipped : [];
        generateCharacterTextureCache(this, 'player', playerStyle, equipped);

        // 선물 상자 텍스처 절차적 생성
        if (!this.textures.exists('obj-box')) {
            const boxTexture = this.textures.createCanvas('obj-box', 16, 16);
            const bxCtx = boxTexture.context;
            bxCtx.fillStyle = '#f59e0b'; // Amber yellow box
            bxCtx.fillRect(2, 2, 12, 12);
            bxCtx.fillStyle = '#ef4444'; // Red ribbon
            bxCtx.fillRect(7, 2, 2, 12);
            bxCtx.fillRect(2, 7, 12, 2);
            boxTexture.refresh();
        }
    }

    create() {
        // 1. 타일맵 직접 드로잉
        const tileKeys = ['tile-grass', 'tile-flower', 'tile-brick', 'tile-water'];
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                this.add.image(x * TILE_SIZE + 16, y * TILE_SIZE + 16, tileKeys[mapData[y][x]]);
            }
        }

        // 2. 충돌 영역 지정 (Rectangle 사용)
        this.staticObstacles = this.physics.add.staticGroup();
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                if (obstaclesMap[y][x] === 1) {
                    const block = this.add.rectangle(x * TILE_SIZE + 16, y * TILE_SIZE + 16, TILE_SIZE, TILE_SIZE);
                    block.isWater = (mapData[y][x] === 3);
                    this.physics.add.existing(block, true);
                    block.setVisible(false);
                    this.staticObstacles.add(block);
                }
            }
        }

        // 3. 건물 구조물 배치
        this.spawnBuildings();

        // 4. 나무 가로수 스폰
        this.spawnTrees();

        // 5. 플레이어 생성 (분수대 아래 시작 또는 이전 씬에서 넘어온 좌표)
        const spawnX = (this.spawnCoords && this.spawnCoords.x !== undefined) ? this.spawnCoords.x : 30 * TILE_SIZE + 16;
        const spawnY = (this.spawnCoords && this.spawnCoords.y !== undefined) ? this.spawnCoords.y : 33 * TILE_SIZE + 16;
        this.player = this.physics.add.sprite(spawnX, spawnY, 'player', 'down');
        this.physics.world.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);
        this.player.setCollideWorldBounds(true);
        this.player.body.setCircle(8, 8, 16); // 발밑 원형 충돌 판정

        this.physics.add.collider(this.player, this.staticObstacles, null, (player, obstacle) => {
            if (activeBuffs.gravity || activeBuffs.ghost) return false;
            if (currentUser && currentUser.equipped.includes('item_balloon') && obstacle.isWater) return false;
            if (activeBuffs.freeze && obstacle.isWater) return false;
            if (onBoat && obstacle.isWater) return false;
            return true;
        }, this);

        // 6. 카메라 설정
        this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.setZoom(1.5);

        // 7. 키보드 컨트롤 매핑
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });
        
        this.input.keyboard.on('keydown-SPACE', () => {
            this.handleInteraction();
        });

        this.input.keyboard.on('keydown-SHIFT', () => {
            triggerDash(this);
        });

        // 8. NPC 동적 생성 및 물리 설정
        this.npcGroup = this.physics.add.staticGroup();
        this.spawnNPCs();
        this.physics.add.collider(this.player, this.npcGroup, null, () => {
            if (activeBuffs.gravity) return false;
            return true;
        }, this);

        // 9. 돌발 황금 동전 스폰 물리 그룹 설정
        this.coinsGroup = this.physics.add.group();
        this.physics.add.overlap(this.player, this.coinsGroup, this.collectCoin, null, this);
        
        // 10초마다 돌발 동전 스폰 작동
        this.time.addEvent({
            delay: 10000,
            callback: this.spawnRandomCoin,
            callbackScope: this,
            loop: true
        });
        // 시작 직후 즉시 10개 미리 스폰
        for (let i = 0; i < 10; i++) this.spawnRandomCoin();

        // 10. 상호작용 알림 말풍선 UI
        this.interactionPrompt = this.add.text(0, 0, 'Space 키로 대화/퀴즈', {
            fontFamily: 'Galmuri9, monospace',
            fontSize: '10px',
            backgroundColor: '#000000bb',
            padding: { x: 8, y: 5 },
            borderRadius: 6
        });
        this.interactionPrompt.setOrigin(0.5, 1);
        this.interactionPrompt.setVisible(false);
        this.interactionPrompt.setDepth(10000);

        // 11. 차원 이동 포탈 추가 (빛나는 보라색 포탈)
        this.dimensionPortal = this.add.circle(47 * TILE_SIZE + 16, 12 * TILE_SIZE + 16, 20, 0x8b5cf6);
        this.dimensionPortal.setStrokeStyle(2, 0xffffff);
        this.physics.add.existing(this.dimensionPortal, true);
        this.tweens.add({
            targets: this.dimensionPortal,
            scale: 1.2,
            alpha: 0.7,
            duration: 800,
            yoyo: true,
            loop: -1
        });

        // 12. 선물 상자(Lucky Box) 물리 그룹
        this.boxesGroup = this.physics.add.group();
        this.physics.add.overlap(this.player, this.boxesGroup, this.collectBox, null, this);
        
        // 8초마다 돌발 선물 상자 스폰
        this.time.addEvent({
            delay: 8000,
            callback: this.spawnRandomBox,
            callbackScope: this,
            loop: true
        });
        
        // 시작 즉시 선물 상자 10개 스폰 시도
        for (let i = 0; i < 10; i++) this.spawnRandomBox();

        // 실시간 지도 동기화 루프
        this.time.addEvent({
            delay: 150,
            callback: () => {
                const pGridX = Math.floor(this.player.x / TILE_SIZE);
                const pGridY = Math.floor(this.player.y / TILE_SIZE);
                document.getElementById('current-coords').innerText = `X: ${pGridX}, Y: ${pGridY}`;
                drawMinimap(pGridX, pGridY);
            },
            loop: true
        });

        this.cameras.main.fadeIn(200);
    }

    spawnBuildings() {
        const structures = [
            // 중앙 광장 분수대
            { x: 29, y: 28, type: 'obj-fountain', cx: 32, cy: 32, cw: 56, ch: 40, co: 8 },
            // 주택지역
            { x: 20, y: 20, type: 'obj-house', cx: 48, cy: 40, cw: 84, ch: 40, co: 16 },
            { x: 20, y: 13, type: 'obj-house-blue', cx: 48, cy: 40, cw: 84, ch: 40, co: 16 },
            { x: 20, y: 6, type: 'obj-house-green', cx: 48, cy: 40, cw: 84, ch: 40, co: 16 },
            // 동쪽 상가
            { x: 34, y: 25, type: 'obj-mart', cx: 64, cy: 40, cw: 116, ch: 40, co: 16 },
            { x: 34, y: 18, type: 'obj-house-blue', cx: 48, cy: 40, cw: 84, ch: 40, co: 16 },
            { x: 44, y: 17, type: 'obj-house-green', cx: 48, cy: 40, cw: 84, ch: 40, co: 16 },
            // 확장된 동쪽 마을
            { x: 58, y: 28, type: 'obj-house', cx: 48, cy: 40, cw: 84, ch: 40, co: 16 },
            { x: 58, y: 14, type: 'obj-house-blue', cx: 48, cy: 40, cw: 84, ch: 40, co: 16 },
            { x: 65, y: 28, type: 'obj-house-green', cx: 48, cy: 40, cw: 84, ch: 40, co: 16 },
            { x: 65, y: 14, type: 'obj-house', cx: 48, cy: 40, cw: 84, ch: 40, co: 16 },
            // 남쪽 마을
            { x: 30, y: 60, type: 'obj-house', cx: 48, cy: 40, cw: 84, ch: 40, co: 16 },
            { x: 40, y: 60, type: 'obj-house-blue', cx: 48, cy: 40, cw: 84, ch: 40, co: 16 },
            { x: 50, y: 60, type: 'obj-house-green', cx: 48, cy: 40, cw: 84, ch: 40, co: 16 },
            { x: 60, y: 60, type: 'obj-mart', cx: 64, cy: 40, cw: 116, ch: 40, co: 16 },
            // 동쪽 광장 분수대
            { x: 49, y: 48, type: 'obj-fountain', cx: 32, cy: 32, cw: 56, ch: 40, co: 8 },
            // 선착장 (보트 탑승 위치)
            { x: 40, y: 12, type: 'obj-dock', cx: 16, cy: 16, cw: 32, ch: 32, co: 0 },
            { x: 73, y: 20, type: 'obj-dock', cx: 16, cy: 16, cw: 32, ch: 32, co: 0 },
            // 가로등
            { x: 28, y: 4, type: 'obj-streetlight', cx: 16, cy: 32, cw: 12, ch: 12, co: 24 },
            { x: 28, y: 12, type: 'obj-streetlight', cx: 16, cy: 32, cw: 12, ch: 12, co: 24 },
            { x: 28, y: 20, type: 'obj-streetlight', cx: 16, cy: 32, cw: 12, ch: 12, co: 24 },
            { x: 28, y: 38, type: 'obj-streetlight', cx: 16, cy: 32, cw: 12, ch: 12, co: 24 },
            { x: 32, y: 4, type: 'obj-streetlight', cx: 16, cy: 32, cw: 12, ch: 12, co: 24 },
            { x: 32, y: 12, type: 'obj-streetlight', cx: 16, cy: 32, cw: 12, ch: 12, co: 24 },
            { x: 32, y: 20, type: 'obj-streetlight', cx: 16, cy: 32, cw: 12, ch: 12, co: 24 },
            { x: 32, y: 38, type: 'obj-streetlight', cx: 16, cy: 32, cw: 12, ch: 12, co: 24 },
            { x: 48, y: 38, type: 'obj-streetlight', cx: 16, cy: 32, cw: 12, ch: 12, co: 24 },
            { x: 52, y: 38, type: 'obj-streetlight', cx: 16, cy: 32, cw: 12, ch: 12, co: 24 },
            { x: 48, y: 56, type: 'obj-streetlight', cx: 16, cy: 32, cw: 12, ch: 12, co: 24 },
            { x: 52, y: 56, type: 'obj-streetlight', cx: 16, cy: 32, cw: 12, ch: 12, co: 24 },
            // 벤치
            { x: 27, y: 32, type: 'obj-bench', cx: 24, cy: 16, cw: 40, ch: 16, co: 8 },
            { x: 31, y: 32, type: 'obj-bench', cx: 24, cy: 16, cw: 40, ch: 16, co: 8 },
            { x: 10, y: 13, type: 'obj-bench', cx: 24, cy: 16, cw: 40, ch: 16, co: 8 },
            { x: 14, y: 45, type: 'obj-bench', cx: 24, cy: 16, cw: 40, ch: 16, co: 8 },
            { x: 42, y: 8, type: 'obj-bench', cx: 24, cy: 16, cw: 40, ch: 16, co: 8 },
            { x: 47, y: 52, type: 'obj-bench', cx: 24, cy: 16, cw: 40, ch: 16, co: 8 },
            { x: 53, y: 52, type: 'obj-bench', cx: 24, cy: 16, cw: 40, ch: 16, co: 8 },
        ];

        structures.forEach(s => {
            const px = s.x * TILE_SIZE + s.cx;
            const py = s.y * TILE_SIZE + s.cy;
            const image = this.add.image(px, py, s.type);
            image.setDepth(py);

            if (s.type !== 'obj-dock') {
                const zone = this.add.rectangle(px, py + s.co, s.cw, s.ch);
                this.physics.add.existing(zone, true);
                zone.setVisible(false);
                this.staticObstacles.add(zone);
            }
        });



        // 본래 울타리
        for (let y = 5; y <= 23; y++) {
            if (y !== 10 && y !== 11 && y !== 17 && y !== 18) {
                const px = 23 * TILE_SIZE + 16;
                const py = y * TILE_SIZE + 16;
                const f = this.add.image(px, py, 'obj-fence');
                f.setDepth(py);

                const fZone = this.add.rectangle(px, py + 8, 32, 16);
                this.physics.add.existing(fZone, true);
                fZone.setVisible(false);
                this.staticObstacles.add(fZone);
            }
        }
    }

    spawnTrees() {
        const treePositions = [];

        // 1. 북서쪽 숲
        for (let y = 3; y < 19; y += 2) {
            for (let x = 3; x < 19; x += 2) {
                if ((x < 6 || x > 13 || y < 6 || y > 13) && Math.random() < 0.75) {
                    treePositions.push({ x, y });
                }
            }
        }

        // 2. 남서쪽 사과나무 과수원
        for (let y = 36; y <= 42; y += 2) {
            for (let x = 4; x <= 16; x += 2) {
                if (Math.random() < 0.8) {
                    treePositions.push({ x, y, isApple: true });
                }
            }
        }

        // 3. 호수 주변
        for (let x = 38; x < 58; x += 3) {
            treePositions.push({ x, y: 4 });
            treePositions.push({ x, y: 19 });
        }

        // 4. 가로수
        for (let y = 3; y < MAP_HEIGHT - 3; y += 4) {
            if (y < 23 || y > 36) {
                if (y % 8 !== 4) {
                    treePositions.push({ x: 27, y });
                    treePositions.push({ x: 33, y });
                }
            }
        }

        // 5. 무작위
        for (let i = 0; i < 50; i++) {
            const tx = Phaser.Math.Between(2, MAP_WIDTH - 3);
            const ty = Phaser.Math.Between(2, MAP_HEIGHT - 3);
            if ((tx < 23 || tx > 36 || ty < 23 || ty > 36) && 
                mapData[ty][tx] !== 2 && mapData[ty][tx] !== 3 && 
                tx !== 20 && tx !== 34 && tx !== 44) {
                treePositions.push({ x: tx, y: ty });
            }
        }

        treePositions.forEach(pos => {
            const px = pos.x * TILE_SIZE + 16;
            const py = pos.y * TILE_SIZE + 24;
            const key = pos.isApple || (Math.random() < 0.35) ? 'obj-tree-apple' : 'obj-tree';

            const t = this.add.image(px, py, key);
            t.setDepth(py);
            
            const tZone = this.add.rectangle(px, py + 12, 16, 16);
            this.physics.add.existing(tZone, true);
            tZone.setVisible(false);
            this.staticObstacles.add(tZone);
        });
    }

    spawnNPCs() {
        this.npcGroup.clear(true, true);
        this.npcSprites = {};

        const npcList = getNPCs();
        npcList.forEach(npc => {
            const key = `npc_${npc.id}`;
            generateCharacterTextureCache(this, key, npc.spriteStyle);

            const px = npc.mapX * TILE_SIZE + 16;
            const py = npc.mapY * TILE_SIZE + 16;
            
            const sprite = this.npcGroup.create(px, py, key, 'down');
            sprite.setDepth(py);
            sprite.npcData = npc;
            
            this.npcSprites[npc.id] = sprite;
        });
    }

    // 돌발 황금 동전 스폰
    spawnRandomCoin() {
        // 맵 확장 시 20개까지 제한
        if (this.coinsGroup.getChildren().length >= 50) return;

        let found = false;
        let cx, cy;
        
        for (let attempts = 0; attempts < 80; attempts++) {
            cx = Phaser.Math.Between(2, MAP_WIDTH - 3);
            cy = Phaser.Math.Between(2, MAP_HEIGHT - 3);
            
            if (obstaclesMap[cy][cx] === 0 && mapData[cy][cx] !== 3) {
                found = true;
                break;
            }
        }

        if (found) {
            const px = cx * TILE_SIZE + 16;
            const py = cy * TILE_SIZE + 16;
            
            const coin = this.physics.add.sprite(px, py, 'obj-coin');
            coin.setDepth(py);
            this.coinsGroup.add(coin);
            
            this.tweens.add({
                targets: coin,
                y: py - 6,
                duration: 600 + Math.random() * 300,
                yoyo: true,
                loop: -1,
                ease: 'Sine.easeInOut'
            });
        }
    }

    // 동전 획득 콜백
    collectCoin(player, coin) {
        coin.destroy();
        
        playSynthDing();
        
        let amount = 10;
        if (activeBuffs.shield) amount = 20;       // 골드 2배 버프
        if (currentUser && currentUser.equipped.includes('item_lucky_coin')) {
            amount = Math.floor(amount * 1.5);      // 행운의 동전 +50%
        }
        if (activeBuffs.lucky) amount = Math.floor(amount * 2.5); // 초행운 버프
        
        if (currentUser) {
            currentUser.gold += amount;
            syncCurrentUser();
        }

        // 플로팅 텍스트 둥둥 띄우기 연출
        const floatText = this.add.text(player.x, player.y - 10, `+${amount}G`, {
            fontFamily: 'Galmuri9, monospace',
            fontSize: '11px',
            color: activeBuffs.shield ? '#06b6d4' : '#ffd54f',
            stroke: '#000000',
            strokeThickness: 2
        });
        floatText.setOrigin(0.5, 0.5);
        floatText.setDepth(20000);

        this.tweens.add({
            targets: floatText,
            y: player.y - 40,
            alpha: 0,
            duration: 800,
            onComplete: () => floatText.destroy()
        });
    }

    // 선물 상자 획득 콜백
    collectBox(player, box) {
        box.destroy();
        playSynthDing();
        
        const effects = ['giant', 'mini', 'magnet', 'shield', 'boost', 'invisible', 'freeze', 'lucky', 'autoGold', 'gravity', 'ghost', 'teleport', 'confusion', 'speedDown'];
        const chosenEffect = Phaser.Utils.Array.GetRandom(effects);
        
        activateBuff(chosenEffect);
        
        const floatText = this.add.text(player.x, player.y - 15, '🎁 ITEM!', {
            fontFamily: 'Galmuri9, monospace',
            fontSize: '12px',
            color: '#fbbf24',
            stroke: '#000000',
            strokeThickness: 3
        });
        floatText.setOrigin(0.5, 0.5);
        floatText.setDepth(20000);
        
        this.tweens.add({
            targets: floatText,
            y: player.y - 45,
            alpha: 0,
            duration: 1000,
            onComplete: () => floatText.destroy()
        });
    }

    // 돌발 선물 상자 스폰
    spawnRandomBox() {
        if (this.boxesGroup.getChildren().length >= 20) return;
        
        let found = false;
        let cx, cy;
        for (let attempts = 0; attempts < 50; attempts++) {
            cx = Phaser.Math.Between(2, MAP_WIDTH - 3);
            cy = Phaser.Math.Between(2, MAP_HEIGHT - 3);
            if (obstaclesMap[cy][cx] === 0 && mapData[cy][cx] !== 3) {
                found = true;
                break;
            }
        }
        if (found) {
            const px = cx * TILE_SIZE + 16;
            const py = cy * TILE_SIZE + 16;
            const box = this.physics.add.sprite(px, py, 'obj-box');
            box.setDepth(py);
            this.boxesGroup.add(box);
            
            this.tweens.add({
                targets: box,
                y: py - 4,
                duration: 600,
                yoyo: true,
                loop: -1,
                ease: 'Sine.easeInOut'
            });
        }
    }

    // 레인보우 파티클 트레일 생성 헬퍼
    spawnTrailParticle(x, y) {
        const colors = [0xff8a80, 0xffd54f, 0x81c784, 0x4fc3f7, 0xba68c8];
        const color = Phaser.Utils.Array.GetRandom(colors);
        
        const dot = this.add.circle(
            x + Phaser.Math.Between(-6, 6), 
            y + Phaser.Math.Between(-2, 6), 
            Phaser.Math.Between(2, 4), 
            color
        );
        dot.setDepth(y - 1);
        
        this.tweens.add({
            targets: dot,
            scale: 0.1,
            alpha: 0,
            duration: 500,
            onComplete: () => dot.destroy()
        });
    }

    // 눈꽃 흔적 이펙트 헬퍼
    spawnSnowTrailParticle(x, y) {
        const dot = this.add.text(
            x + Phaser.Math.Between(-8, 8),
            y + Phaser.Math.Between(-2, 6),
            '❄️',
            { fontSize: '8px' }
        );
        dot.setDepth(y - 1);
        
        this.tweens.add({
            targets: dot,
            scale: 0.1,
            alpha: 0,
            y: y - 5,
            duration: 600,
            onComplete: () => dot.destroy()
        });
    }

    // 번개 오라 ⚡ 이펙트 헬퍼
    spawnElectricSpark(px, py) {
        const angle = (this.time.now / 150) % (Math.PI * 2);
        const radius = 24 * (activeBuffs.giant ? 2.2 : (activeBuffs.mini ? 0.5 : 1));
        const sx = px + Math.cos(angle) * radius;
        const sy = py + Math.sin(angle) * radius;
        
        const spark = this.add.text(sx, sy, '⚡', {
            fontFamily: 'monospace',
            fontSize: activeBuffs.giant ? '14px' : '9px',
            color: '#ffd54f'
        });
        spark.setOrigin(0.5, 0.5);
        spark.setDepth(py + 10);
        
        this.tweens.add({
            targets: spark,
            scale: 1.5,
            alpha: 0,
            duration: 300,
            onComplete: () => spark.destroy()
        });
    }

    // 불꽃 오라 🔥 이펙트 헬퍼
    spawnFireSpark(px, py) {
        const angle = (this.time.now / 120) % (Math.PI * 2);
        const radius = 24 * (activeBuffs.giant ? 2.2 : (activeBuffs.mini ? 0.5 : 1));
        const sx = px + Math.cos(angle) * radius;
        const sy = py + Math.sin(angle) * radius;
        
        const spark = this.add.text(sx, sy, '🔥', {
            fontFamily: 'monospace',
            fontSize: activeBuffs.giant ? '14px' : '9px',
            color: '#f97316'
        });
        spark.setOrigin(0.5, 0.5);
        spark.setDepth(py + 10);
        
        this.tweens.add({
            targets: spark,
            scale: 1.6,
            alpha: 0,
            duration: 350,
            onComplete: () => spark.destroy()
        });
    }

    // 얼음 오라 🧊 이펙트 헬퍼
    spawnIceSpark(px, py) {
        const angle = -(this.time.now / 180) % (Math.PI * 2);
        const radius = 24 * (activeBuffs.giant ? 2.2 : (activeBuffs.mini ? 0.5 : 1));
        const sx = px + Math.cos(angle) * radius;
        const sy = py + Math.sin(angle) * radius;
        
        const spark = this.add.text(sx, sy, '❄️', {
            fontFamily: 'monospace',
            fontSize: activeBuffs.giant ? '12px' : '8px',
            color: '#38bdf8'
        });
        spark.setOrigin(0.5, 0.5);
        spark.setDepth(py + 10);
        
        this.tweens.add({
            targets: spark,
            scale: 1.4,
            alpha: 0,
            duration: 400,
            onComplete: () => spark.destroy()
        });
    }

    update() {
        if (!currentUser) return;
        
        if (this.isInteracting) {
            this.player.setVelocity(0);
            return;
        }

        // 대시 중 처리
        if (dashActiveTimer > 0) {
            dashActiveTimer -= this.game.loop.delta;
            this.player.setVelocity(dashDirX * 320, dashDirY * 320);
            if (this.time.now % 2 === 0) {
                this.spawnTrailParticle(this.player.x, this.player.y + 12);
            }
            this.player.setDepth(this.player.y);
            return;
        }

        // 버프 및 아이템 장착 여부에 따른 이동속도 세팅
        let speed = currentUser.equipped.includes('item_shoes') ? 180 : 120;
        if (currentUser.equipped.includes('item_cat')) speed += 30; // 고양이 꼬리 +30속도
        if (onBoat) speed = 150;
        if (activeBuffs.boost) speed = 260;
        else if (activeBuffs.giant) speed = 200;
        
        if (activeBuffs.speedDown) speed *= 0.4;
        
        this.player.setVelocity(0);

        let dx = 0;
        let dy = 0;

        let leftDown = this.cursors.left.isDown || this.wasd.left.isDown;
        let rightDown = this.cursors.right.isDown || this.wasd.right.isDown;
        let upDown = this.cursors.up.isDown || this.wasd.up.isDown;
        let downDown = this.cursors.down.isDown || this.wasd.down.isDown;

        if (activeBuffs.confusion) {
            let temp = leftDown;
            leftDown = rightDown;
            rightDown = temp;
            temp = upDown;
            upDown = downDown;
            downDown = temp;
        }

        if (leftDown) {
            dx = -1;
            this.player.setFrame('left');
        } else if (rightDown) {
            dx = 1;
            this.player.setFrame('right');
        }

        if (upDown) {
            dy = -1;
            this.player.setFrame('up');
        } else if (downDown) {
            dy = 1;
            this.player.setFrame('down');
        }

        if (dx !== 0 && dy !== 0) {
            dx *= 0.7071;
            dy *= 0.7071;
        }

        // Boat restriction: prevent moving into non-water tiles
        if (onBoat) {
            const nextX = this.player.x + dx * speed * (this.game.loop.delta / 1000);
            const nextY = this.player.y + dy * speed * (this.game.loop.delta / 1000);
            const gridX = Math.floor(nextX / TILE_SIZE);
            const gridY = Math.floor(nextY / TILE_SIZE);
            const isDock = (gridX >= 39 && gridX <= 41 && gridY >= 11 && gridY <= 13) || 
                           (gridX >= 72 && gridX <= 74 && gridY >= 19 && gridY <= 21);
            if (mapData[gridY] && mapData[gridY][gridX] !== 3 && !isDock) {
                dx = 0;
                dy = 0;
            }
        }

        this.player.setVelocity(dx * speed, dy * speed);
        this.player.setDepth(this.player.y);

        // 파티클 트레일 연출 (레인보우 이펙트 장착 시)
        if (this.player.body.speed > 0 && currentUser.equipped.includes('item_trail_rainbow')) {
            this.spawnTrailParticle(this.player.x, this.player.y + 12);
        }
        
        // 눈꽃 흔적 잔상 연출 (눈꽃 이펙트 장착 시)
        if (this.player.body.speed > 0 && currentUser.equipped.includes('item_trail_snow')) {
            this.spawnSnowTrailParticle(this.player.x, this.player.y + 12);
        }

        // 번개 오라 ⚡ 상시 회전 방출 연출 (번개 이펙트 장착 시)
        if (currentUser.equipped.includes('item_aura_spark') && this.time.now % 10 < 3) {
            this.spawnElectricSpark(this.player.x, this.player.y);
        }

        // 불꽃 오라 🔥 상시 회전 방출 연출 (불꽃 오라 장착 시)
        if (currentUser.equipped.includes('item_aura_fire') && this.time.now % 10 < 3) {
            this.spawnFireSpark(this.player.x, this.player.y);
        }

        // 얼음 오라 🧊 상시 회전 방출 연출 (얼음 오라 장착 시)
        if (currentUser.equipped.includes('item_aura_ice') && this.time.now % 10 < 3) {
            this.spawnIceSpark(this.player.x, this.player.y);
        }

        // 돌발 부스터 버프 트레일 강제 방출
        if (activeBuffs.boost && this.player.body.speed > 0 && this.time.now % 5 < 2) {
            this.spawnTrailParticle(this.player.x, this.player.y + 12);
        }

        // 자석(magnet) 효과로 반경 180px 동전 자동 끌어당김
        if (activeBuffs.magnet) {
            this.coinsGroup.getChildren().forEach(coin => {
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, coin.x, coin.y);
                if (dist < 180) {
                    const angle = Phaser.Math.Angle.Between(coin.x, coin.y, this.player.x, this.player.y);
                    coin.body.setVelocity(Math.cos(angle) * 200, Math.sin(angle) * 200);
                } else {
                    coin.body.setVelocity(0);
                }
            });
        }

        // 집 안 들어가기 감지 (문 좌표 근처 진입)
        HOUSE_DOORS.forEach(door => {
            const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, door.x, door.y);
            if (distance < 20) {
                this.isInteracting = true;
                this.cameras.main.fadeOut(200);
                this.time.delayedCall(200, () => {
                    this.scene.stop('WorldScene');
                    this.scene.start('IndoorScene', { type: door.type, parentCoords: { x: Math.floor(door.x / TILE_SIZE), y: Math.floor(door.y / TILE_SIZE) - 2 } });
                });
            }
        });

        // 차원 이동 포탈 충돌 체크 (환상의 크리스탈 숲으로 이동)
        const distPortal = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.dimensionPortal.x, this.dimensionPortal.y);
        if (distPortal < 25) {
            this.isInteracting = true;
            this.cameras.main.fadeOut(200);
            this.time.delayedCall(200, () => {
                this.scene.stop('WorldScene');
                this.scene.start('FantasyForestScene');
            });
        }

        // 선장 근첲 보트 탑승 감지
        const dockPositions = [
            { wx: 40 * TILE_SIZE + 16, wy: 12 * TILE_SIZE + 16 },
            { wx: 73 * TILE_SIZE + 16, wy: 20 * TILE_SIZE + 16 }
        ];
        let nearDock = false;
        for (const dock of dockPositions) {
            if (Phaser.Math.Distance.Between(this.player.x, this.player.y, dock.wx, dock.wy) < 48) {
                nearDock = true;
                break;
            }
        }
        
        if (nearDock && currentUser && currentUser.equipped.includes('item_boat_pass')) {
            if (onBoat) {
                showHUDMessage('⛵ Space 또는 Talk 버튼으로 보트 하선!');
            } else {
                showHUDMessage('⛵ Space 또는 Talk 버튼으로 보트 탑승!');
            }
        }

        // NPC 대화 감지
        let nearbyNpc = null;
        let minDistance = 50;
        this.npcGroup.getChildren().forEach(npcSprite => {
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, npcSprite.x, npcSprite.y);
            if (dist < minDistance) {
                nearbyNpc = npcSprite;
                minDistance = dist;
            }
        });

        if (nearbyNpc) {
            this.activeNpc = nearbyNpc.npcData;
            this.interactionPrompt.setPosition(nearbyNpc.x, nearbyNpc.y - 20);
            this.interactionPrompt.setVisible(true);
        } else {
            this.activeNpc = null;
            this.interactionPrompt.setVisible(false);
        }
    }

    handleInteraction() {
        if (this.isInteracting) {
            progressDialogue();
            return;
        }

        // 선착장 보트 탑승/하선 체크
        const dockPositions = [
            { wx: 40 * TILE_SIZE + 16, wy: 12 * TILE_SIZE + 16 },
            { wx: 73 * TILE_SIZE + 16, wy: 20 * TILE_SIZE + 16 }
        ];
        let nearDock = false;
        for (const dock of dockPositions) {
            if (Phaser.Math.Distance.Between(this.player.x, this.player.y, dock.wx, dock.wy) < 48) {
                nearDock = true;
                break;
            }
        }

        if (nearDock && currentUser && currentUser.equipped.includes('item_boat_pass')) {
            onBoat = !onBoat;
            if (onBoat) {
                showHUDMessage('⛵ 보트에 탑승했습니다! 호수를 건널 수 있습니다.');
            } else {
                showHUDMessage('⛵ 보트에서 하선했습니다.');
            }
            applyPhaserBuffVisuals(Object.keys(activeBuffs).find(k => activeBuffs[k] === true && k !== 'timer'));
            return;
        }

        if (this.activeNpc) {
            this.isInteracting = true;
            startDialogue(this.activeNpc);
            
            const sprite = this.npcSprites[this.activeNpc.id];
            if (sprite) {
                const diffX = this.player.x - sprite.x;
                const diffY = this.player.y - sprite.y;
                if (Math.abs(diffX) > Math.abs(diffY)) {
                    sprite.setFrame(diffX > 0 ? 'right' : 'left');
                } else {
                    sprite.setFrame(diffY > 0 ? 'down' : 'up');
                }
            }
        }
    }

    teleportTo(x, y) {
        const targetX = x * TILE_SIZE + 16;
        const targetY = y * TILE_SIZE + 16;
        
        this.cameras.main.fadeOut(200);
        this.time.delayedCall(200, () => {
            this.player.setPosition(targetX, targetY);
            this.cameras.main.fadeIn(200);
        });
    }

    refreshPlayerSkin() {
        if (!currentUser) return;
        generateCharacterTextureCache(this, 'player', currentUser.spriteStyle, currentUser.equipped);
        this.player.setTexture('player', 'down');
        
        // 토끼 머리띠 장착 여부에 따른 모바일 대시 버튼 노출/숨김
        const dashBtn = document.getElementById('dash-button');
        if (dashBtn) {
            if (currentUser.equipped.includes('item_bunny')) {
                dashBtn.classList.remove('hidden');
                updateDashButtonCooldown();
            } else {
                dashBtn.classList.add('hidden');
            }
        }
    }
}


// ==========================================================================
// 5. 대화창 & 퀴즈 풀기 시스템 (Dialogue & Quiz Solver)
// ==========================================================================

let dialogueState = {
    npc: null,
    lines: [],
    currentLineIndex: 0,
    displayedText: '',
    typingTimer: null,
    isTyping: false
};

// Web Audio API 레트로 음향 합성
function playBeepSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.08);
    } catch (e) {}
}

function playSynthDing() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
        
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc1.start(); osc2.start();
        osc1.stop(audioCtx.currentTime + 0.3); osc2.stop(audioCtx.currentTime + 0.3);
    } catch (e) {}
}

function playSynthFail() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, audioCtx.currentTime); // Low A
        osc.frequency.linearRampToValueAtTime(150, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.25);
    } catch (e) {}
}

function startDialogue(npc) {
    dialogueState.npc = npc;
    dialogueState.lines = [...npc.dialogues];
    dialogueState.currentLineIndex = 0;
    
    // UI 로드
    const box = document.getElementById('dialogue-box');
    box.querySelector('.npc-name').innerText = npc.name;
    box.querySelector('.npc-role').innerText = npc.role;
    
    const avatarCanvas = document.getElementById('dialogue-avatar-canvas');
    drawPixelCharacter(avatarCanvas.getContext('2d'), npc.spriteStyle, 'down');
    
    box.classList.remove('hidden');
    displayCurrentLine();
}

function displayCurrentLine() {
    const textElement = document.querySelector('#dialogue-box .dialogue-text');
    const rawText = dialogueState.lines[dialogueState.currentLineIndex];
    
    if (dialogueState.typingTimer) clearInterval(dialogueState.typingTimer);
    dialogueState.isTyping = true;
    dialogueState.displayedText = '';
    textElement.innerText = '';
    
    let charIndex = 0;
    dialogueState.typingTimer = setInterval(() => {
        if (charIndex < rawText.length) {
            dialogueState.displayedText += rawText[charIndex];
            textElement.innerText = dialogueState.displayedText;
            charIndex++;
            if (charIndex % 2 === 0) playBeepSound();
        } else {
            clearInterval(dialogueState.typingTimer);
            dialogueState.isTyping = false;
        }
    }, 40);
}

function progressDialogue() {
    const textElement = document.querySelector('#dialogue-box .dialogue-text');
    const rawText = dialogueState.lines[dialogueState.currentLineIndex];
    
    if (dialogueState.isTyping) {
        clearInterval(dialogueState.typingTimer);
        textElement.innerText = rawText;
        dialogueState.isTyping = false;
    } else {
        dialogueState.currentLineIndex++;
        if (dialogueState.currentLineIndex < dialogueState.lines.length) {
            displayCurrentLine();
        } else {
            // 모든 일반 대사가 끝났을 때: 
            // 35% 확률로 이웃이 안 푼 동네 퀴즈가 있다면 퀴즈를 출제합니다.
            const unsolvedQuizzes = getQuizzes().filter(q => !currentUser.solvedQuizzes.includes(q.id));
            if (unsolvedQuizzes.length > 0 && Math.random() < 0.4) {
                closeDialogueOnly();
                // 퀴즈 개시
                const randomQuiz = Phaser.Utils.Array.GetRandom(unsolvedQuizzes);
                openQuizSolver(randomQuiz);
            } else {
                // 대화 보상 지급 (1~5G) 및 대화창 종료
                let reward = Math.floor(Math.random() * 5) + 1;
                if (activeBuffs.invisible) {
                    reward *= 3; // 3x surprise reward!
                } else if (currentUser.equipped.includes('item_flower')) {
                    reward *= 2; // Cherry blossom flower pin gives 2x reward!
                }
                currentUser.gold += reward;
                syncCurrentUser();
                
                // 보상 토스트
                if (activeBuffs.invisible) {
                    showHUDMessage(`👻 깜짝 놀란 이웃의 대화 완료 보상 +${reward}G!`);
                } else if (currentUser.equipped.includes('item_flower')) {
                    showHUDMessage(`🌸 벚꽃 핀 보너스 대화 완료 보상 +${reward}G!`);
                } else {
                    showHUDMessage(`💬 대화 완료 보상 +${reward}G!`);
                }
                closeDialogue();
            }
        }
    }
}

function closeDialogueOnly() {
    if (dialogueState.typingTimer) clearInterval(dialogueState.typingTimer);
    document.getElementById('dialogue-box').classList.add('hidden');
}

function resetAllInteractions() {
    if (gameInstance) {
        const scenes = ['WorldScene', 'IndoorScene', 'FantasyForestScene'];
        scenes.forEach(name => {
            const s = gameInstance.scene.getScene(name);
            if (s) s.isInteracting = false;
        });
    }
}

function closeDialogue() {
    closeDialogueOnly();
    resetAllInteractions();
}

// 퀴즈 풀기 팝업 트리거
function openQuizSolver(quiz) {
    const modal = document.getElementById('quiz-solver-modal');
    document.getElementById('solver-question-text').innerText = quiz.question;
    document.getElementById('solver-reward-gold').innerText = quiz.reward;
    
    const optionsList = document.getElementById('solver-options-list');
    optionsList.innerHTML = '';
    
    const resultMsg = document.getElementById('solver-result-msg');
    resultMsg.classList.add('hidden');
    resultMsg.innerText = '';

    const footer = document.getElementById('solver-footer');
    footer.innerHTML = '';

    // 4지선다 버튼 추가
    quiz.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'btn-option';
        btn.innerText = `${idx + 1}. ${opt}`;
        
        btn.addEventListener('click', () => {
            // 한 번 정답을 고르면 다른 버튼 비활성화
            const buttons = optionsList.querySelectorAll('.btn-option');
            buttons.forEach(b => b.disabled = true);
            
            if (idx === quiz.correctIndex) {
                // 정답!
                btn.className = 'btn-option correct-choice';
                playSynthDing();
                
                let finalReward = quiz.reward;
                if (currentUser.equipped.includes('item_aura_fire')) {
                    finalReward = Math.floor(quiz.reward * 1.5); // 50% bonus gold for fire aura!
                }
                
                resultMsg.className = 'solver-result-msg success';
                resultMsg.innerText = currentUser.equipped.includes('item_aura_fire')
                    ? `🎉 정답입니다! 불꽃 오라 보너스 적용! 보상 +${finalReward}G 획득!`
                    : `🎉 정답입니다! 보상 +${finalReward}G 획득!`;
                resultMsg.classList.remove('hidden');
                
                // 골드 가산 및 푼 리스트 기록
                currentUser.gold += finalReward;
                currentUser.solvedQuizzes.push(quiz.id);
                syncCurrentUser();
                
                // 닫기 버튼 배치
                const closeBtn = document.createElement('button');
                closeBtn.className = 'btn btn-primary';
                closeBtn.innerText = '동네 탐험 계속하기 🏃';
                closeBtn.addEventListener('click', () => {
                    modal.classList.add('hidden');
                    resetAllInteractions();
                });
                footer.appendChild(closeBtn);
            } else {
                // 오답!
                btn.className = 'btn-option incorrect-choice';
                playSynthFail();
                
                resultMsg.className = 'solver-result-msg error';
                resultMsg.innerText = '❌ 아쉬워요! 틀렸습니다. 다시 생각해 볼까요?';
                resultMsg.classList.remove('hidden');
                
                // 다시 시도 버튼 배치
                const retryBtn = document.createElement('button');
                retryBtn.className = 'btn btn-secondary';
                retryBtn.innerText = '다시 시도';
                retryBtn.addEventListener('click', () => {
                    buttons.forEach(b => {
                        b.disabled = false;
                        b.className = 'btn-option';
                    });
                    resultMsg.classList.add('hidden');
                    footer.innerHTML = '';
                });
                
                const giveUpBtn = document.createElement('button');
                giveUpBtn.className = 'btn btn-danger';
                giveUpBtn.innerText = '포기';
                giveUpBtn.addEventListener('click', () => {
                    modal.classList.add('hidden');
                    resetAllInteractions();
                });
                
                footer.appendChild(retryBtn);
                footer.appendChild(giveUpBtn);
            }
        });
        
        optionsList.appendChild(btn);
    });
    
    modal.classList.remove('hidden');
}


// ==========================================================================
// 6. 실시간 월드맵 네비게이터 (Minimap Canvas)
// ==========================================================================

function drawMinimap(playerGridX = null, playerGridY = null) {
    const canvas = document.getElementById('minimap-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const scale = canvas.width / MAP_WIDTH;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
            const tileType = mapData[y][x];
            let color = '#7cb342';
            if (tileType === 2) color = '#b0bec5';
            else if (tileType === 3) color = '#0288d1';
            
            ctx.fillStyle = color;
            ctx.fillRect(x * scale, y * scale, scale, scale);
        }
    }

    const buildings = [
        { x: 29, y: 28, color: '#90a4ae', label: '⛲' },
        { x: 20, y: 20, color: '#e53935', label: '🏠' },
        { x: 20, y: 13, color: '#1e88e5', label: '🏠' },
        { x: 20, y: 6,  color: '#2e7d32', label: '🏡' },
        { x: 34, y: 25, color: '#ffb300', label: '🏪' },
        { x: 34, y: 18, color: '#1e88e5', label: '☕' },
        { x: 44, y: 17, color: '#3949ab', label: '🏫' }
    ];
    
    buildings.forEach(b => {
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x * scale - 2, b.y * scale - 2, scale * 3, scale * 3);
        ctx.fillStyle = '#fff';
        ctx.font = '10px sans-serif';
        ctx.fillText(b.label, b.x * scale - 1, b.y * scale + 6);
    });

    const npcs = getNPCs();
    npcs.forEach(npc => {
        ctx.fillStyle = npc.spriteStyle.outfitColor;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(npc.mapX * scale + scale/2, npc.mapY * scale + scale/2, scale * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });

    // 선글라스 장착 시 동전과 선물 상자 위치를 미니맵에 노란색/분홍색 점으로 표시!
    if (currentUser && currentUser.equipped.includes('item_glasses') && gameInstance) {
        const worldScene = gameInstance.scene.getScene('WorldScene');
        if (worldScene && worldScene.sys.isActive()) {
            // 동전 표시
            if (worldScene.coinsGroup) {
                worldScene.coinsGroup.getChildren().forEach(coin => {
                    const gx = Math.floor(coin.x / TILE_SIZE);
                    const gy = Math.floor(coin.y / TILE_SIZE);
                    ctx.fillStyle = '#ffd54f';
                    ctx.fillRect(gx * scale, gy * scale, scale * 1.5, scale * 1.5);
                });
            }
            // 상자 표시
            if (worldScene.boxesGroup) {
                worldScene.boxesGroup.getChildren().forEach(box => {
                    const gx = Math.floor(box.x / TILE_SIZE);
                    const gy = Math.floor(box.y / TILE_SIZE);
                    ctx.fillStyle = '#f43f5e';
                    ctx.fillRect(gx * scale, gy * scale, scale * 2, scale * 2);
                });
            }
        }
        
        const forestScene = gameInstance.scene.getScene('FantasyForestScene');
        if (forestScene && forestScene.sys.isActive()) {
            const fScale = canvas.width / 40; // FantasyForestScene은 40x40 맵
            // 별 표시
            if (forestScene.starsGroup) {
                forestScene.starsGroup.getChildren().forEach(star => {
                    const gx = Math.floor(star.x / TILE_SIZE);
                    const gy = Math.floor(star.y / TILE_SIZE);
                    ctx.fillStyle = '#ec4899';
                    ctx.fillRect(gx * fScale, gy * fScale, fScale * 1.5, fScale * 1.5);
                });
            }
            // 상자 표시
            if (forestScene.boxesGroup) {
                forestScene.boxesGroup.getChildren().forEach(box => {
                    const gx = Math.floor(box.x / TILE_SIZE);
                    const gy = Math.floor(box.y / TILE_SIZE);
                    ctx.fillStyle = '#22d3ee';
                    ctx.fillRect(gx * fScale, gy * fScale, fScale * 2, fScale * 2);
                });
            }
        }
    }

    if (playerGridX !== null && playerGridY !== null) {
        ctx.fillStyle = '#ff1744';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(playerGridX * scale + scale/2, playerGridY * scale + scale/2, scale * 1.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
}

function setupMinimapClick() {
    const canvas = document.getElementById('minimap-canvas');
    canvas.addEventListener('click', (e) => {
        if (!currentUser) return;
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        const scale = canvas.width / MAP_WIDTH;
        const gridX = Math.floor(clickX / scale);
        const gridY = Math.floor(clickY / scale);
        
        if (gridX > 0 && gridX < MAP_WIDTH - 1 && gridY > 0 && gridY < MAP_HEIGHT - 1) {
            if (mapData[gridY][gridX] !== 3) {
                if (gameInstance) {
                    gameInstance.scene.getScene('WorldScene').teleportTo(gridX, gridY);
                }
                
                document.getElementById('picker-x').innerText = gridX;
                document.getElementById('picker-y').innerText = gridY;
                selectedCoords.x = gridX;
                selectedCoords.y = gridY;
            }
        }
    });
}


// ==========================================================================
// 7. 사이드바 NPC 리스트 관리
// ==========================================================================

function updateSidebarNPCList() {
    const npcs = getNPCs();
    document.getElementById('npc-count').innerText = npcs.length;
    
    const emptyState = document.getElementById('npc-list-empty');
    const activeList = document.getElementById('npc-active-list');
    
    if (npcs.length === 0) {
        emptyState.classList.remove('hidden');
        activeList.innerHTML = '';
        return;
    }
    
    emptyState.classList.add('hidden');
    activeList.innerHTML = '';
    
    npcs.forEach(npc => {
        const li = document.createElement('li');
        li.className = 'npc-item';
        
        li.innerHTML = `
            <div class="npc-item-info">
                <div class="npc-item-avatar">
                    <canvas id="canvas-list-avatar-${npc.id}" width="32" height="32" style="width:32px; height:32px; image-rendering:pixelated;"></canvas>
                </div>
                <div class="npc-item-details">
                    <span class="npc-item-name">${npc.name}</span>
                    <span class="npc-item-role">${npc.role} (X:${npc.mapX}, Y:${npc.mapY})</span>
                </div>
            </div>
            <div class="npc-item-actions">
                <button class="btn-icon btn-teleport" title="이동" data-x="${npc.mapX}" data-y="${npc.mapY}">🚶</button>
                <button class="btn-icon delete" title="삭제" data-id="${npc.id}">&times;</button>
            </div>
        `;
        
        activeList.appendChild(li);
        
        const canvas = document.getElementById(`canvas-list-avatar-${npc.id}`);
        drawPixelCharacter(canvas.getContext('2d'), npc.spriteStyle, 'down');
        
        li.querySelector('.btn-teleport').addEventListener('click', (e) => {
            e.stopPropagation();
            const x = parseInt(e.target.dataset.x);
            const y = parseInt(e.target.dataset.y);
            if (gameInstance) {
                gameInstance.scene.getScene('WorldScene').teleportTo(x, y);
            }
        });

        li.addEventListener('click', () => {
            if (gameInstance) {
                gameInstance.scene.getScene('WorldScene').teleportTo(npc.mapX, npc.mapY);
            }
        });
        
        li.querySelector('.delete').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`'${npc.name}' 님을 동네 목록에서 삭제하시겠습니까?`)) {
                deleteNPC(npc.id);
            }
        });
    });
}

async function saveNPC(npc) {
    const existingIdx = cachedNPCs.findIndex(n => n.id === npc.id);
    if (existingIdx !== -1) {
        cachedNPCs[existingIdx] = npc;
    } else {
        cachedNPCs.push(npc);
    }
    
    // NPC 등록 보상: 100 골드 지급 (신규 NPC 등록 시에만)
    if (existingIdx === -1 && currentUser) {
        currentUser.gold += 100;
        await syncCurrentUser();
        showHUDMessage('🏡 이웃 등록 완료! 개척 보상 +100G 지급!');
    }
    
    updateSidebarNPCList();
    if (gameInstance && gameInstance.scene.isActive('WorldScene')) {
        gameInstance.scene.getScene('WorldScene').spawnNPCs();
    }
    drawMinimap();
    
    try {
        await enqueueAPI('saveNPC', { serverId: currentServer.id, npc: npc });
    } catch (e) {
        console.error("Failed to save NPC remotely:", e);
    }
}

async function deleteNPC(id) {
    cachedNPCs = cachedNPCs.filter(n => n.id !== id);
    updateSidebarNPCList();
    if (gameInstance && gameInstance.scene.isActive('WorldScene')) {
        gameInstance.scene.getScene('WorldScene').spawnNPCs();
    }
    drawMinimap();
    
    try {
        await enqueueAPI('deleteNPC', { serverId: currentServer.id, id: id });
    } catch (e) {
        console.error("Failed to delete NPC remotely:", e);
    }
}



// ==========================================================================
// 8. 패션 상점 & 가방 인벤토리 UI 및 제어
// ==========================================================================

function setupShopAndInventory() {
    const shopModal = document.getElementById('shop-modal');
    const invModal = document.getElementById('inventory-modal');
    
    // 상점 및 인벤토리 제어 이벤트
    document.getElementById('btn-open-shop').addEventListener('click', () => {
        loadShopItems();
        shopModal.classList.remove('hidden');
    });
    
    document.getElementById('btn-open-inventory').addEventListener('click', () => {
        loadInventoryItems();
        invModal.classList.remove('hidden');
    });
    
    document.getElementById('btn-close-shop').addEventListener('click', () => shopModal.classList.add('hidden'));
    document.getElementById('btn-close-inventory').addEventListener('click', () => invModal.classList.add('hidden'));
}

// 상점 아이템 렌더링
function loadShopItems() {
    const grid = document.getElementById('shop-items-grid');
    grid.innerHTML = '';

    SHOP_ITEMS.forEach(item => {
        const isOwned = currentUser.inventory.includes(item.id);
        const card = document.createElement('div');
        card.className = 'shop-item-card';

        // 이모지 매핑
        const emoji = item.name.split(' ')[0];
        const nameText = item.name.substring(emoji.length).trim();

        // 할인율 계산
        let discount = 1.0;
        let discountLabel = '';
        if (currentUser.equipped.includes('item_crown')) {
            discount -= 0.2;
            discountLabel += ' 왕관 20%';
        }
        if (currentUser.equipped.includes('item_aura_ice')) {
            discount -= 0.1;
            discountLabel += ' 얼음 10%';
        }
        const finalCost = Math.floor(item.cost * discount);

        const costHTML = discount < 1.0
            ? `<span style="text-decoration: line-through; opacity: 0.6; font-size: 11px;">💰 ${item.cost}G</span> <span style="color: #fbbf24; font-weight: bold;">💰 ${finalCost}G</span> <span class="badge" style="background: rgba(251, 191, 36, 0.2); color: #fbbf24; font-size: 9px; padding: 2px 4px;">${discountLabel.trim()} 할인</span>`
            : `💰 ${item.cost}G`;

        card.innerHTML = `
            <div class="item-emoji">${emoji}</div>
            <div class="item-name">${nameText}</div>
            <div class="item-desc">${item.desc}</div>
            <div class="item-cost">${costHTML}</div>
            <button class="btn btn-primary btn-sm btn-buy-item" ${isOwned ? 'disabled' : ''}>
                ${isOwned ? '보유 중' : '구매하기'}
            </button>
        `;

        if (!isOwned) {
            card.querySelector('.btn-buy-item').addEventListener('click', () => {
                const actualCost = finalCost;
                if (currentUser.gold >= actualCost) {
                    // 차감 후 구매 완료
                    currentUser.gold -= actualCost;
                    currentUser.inventory.push(item.id);
                    syncCurrentUser();
                    playSynthDing();
                    showHUDMessage(`🛍️ '${nameText}' 구매 완료! 가방에서 착용해 보세요.`);
                    loadShopItems(); // 리프레시
                } else {
                    playSynthFail();
                    alert('보유 골드가 부족합니다! 퀴즈를 풀거나 맵 속 동전을 모아보세요.');
                }
            });
        }

        grid.appendChild(card);
    });
}

// 인벤토리 아이템 렌더링
function loadInventoryItems() {
    const grid = document.getElementById('inventory-items-grid');
    grid.innerHTML = '';

    if (currentUser.inventory.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;">가방이 텅 비어 있습니다.<br>상점에서 아이템을 구매해 보세요!</div>`;
        return;
    }

    currentUser.inventory.forEach(itemId => {
        const item = SHOP_ITEMS.find(i => i.id === itemId);
        if (!item) return;

        const isEquipped = currentUser.equipped.includes(itemId);
        const card = document.createElement('div');
        card.className = 'inventory-item-card';
        
        const emoji = item.name.split(' ')[0];
        const nameText = item.name.substring(emoji.length).trim();

        card.innerHTML = `
            ${isEquipped ? '<span class="equipped-badge">장착중</span>' : ''}
            <div class="item-emoji">${emoji}</div>
            <div class="item-name">${nameText}</div>
            <div class="item-desc">${item.desc}</div>
            <button class="btn btn-sm btn-equip-toggle ${isEquipped ? 'btn-secondary' : 'btn-primary'}">
                ${isEquipped ? '해제' : '장착'}
            </button>
        `;

        card.querySelector('.btn-equip-toggle').addEventListener('click', () => {
            if (isEquipped) {
                // 장착 해제
                currentUser.equipped = currentUser.equipped.filter(id => id !== itemId);
            } else {
                // 새 장비 장착 (다중 장착 지원)
                currentUser.equipped.push(itemId);
            }
            
            syncCurrentUser();
            playSynthDing();
            
            // 플레이어 실시간 텍스처 갱신 유도
            if (gameInstance && gameInstance.scene.isActive('WorldScene')) {
                gameInstance.scene.getScene('WorldScene').refreshPlayerSkin();
            }

            loadInventoryItems(); // 리프레시
        });

        grid.appendChild(card);
    });
}


// ==========================================================================
// 9. 퀴즈 만들기 및 관리 UI (Quiz Manager)
// ==========================================================================

function setupQuizManager() {
    const modal = document.getElementById('quiz-modal');
    
    document.getElementById('btn-open-quiz-manager').addEventListener('click', () => {
        updateQuizListUI();
        modal.classList.remove('hidden');
    });
    
    document.getElementById('btn-close-quiz').addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // 퀴즈 탭 스위칭
    const tabList = document.getElementById('tab-quiz-list');
    const tabCreate = document.getElementById('tab-quiz-create');
    const sectionList = document.getElementById('quiz-list-section');
    const sectionCreate = document.getElementById('quiz-create-section');

    tabList.addEventListener('click', () => {
        tabList.classList.add('active');
        tabCreate.classList.remove('active');
        sectionList.classList.remove('hidden');
        sectionCreate.classList.add('hidden');
        updateQuizListUI();
    });

    tabCreate.addEventListener('click', () => {
        tabList.classList.remove('active');
        tabCreate.classList.add('active');
        sectionList.classList.add('hidden');
        sectionCreate.classList.remove('hidden');
    });

    // 퀴즈 등록 폼 제출
    document.getElementById('quiz-creation-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const question = document.getElementById('quiz-question').value.trim();
        const optionsInputs = document.querySelectorAll('.quiz-opt');
        const correctIndex = parseInt(document.getElementById('quiz-correct').value);
        const reward = parseInt(document.getElementById('quiz-reward').value);

        const options = [];
        optionsInputs.forEach(input => {
            options.push(input.value.trim());
        });

        const newQuiz = {
            id: 'quiz_' + Date.now(),
            creator: currentUser ? currentUser.username : '학생',
            question: question,
            options: options,
            correctIndex: correctIndex,
            reward: reward
        };

        saveQuiz(newQuiz);
        showHUDMessage('❓ 퀴즈가 성공적으로 등록되었습니다!');
        
        // 폼 리셋 및 리스트 탭으로 스위칭
        document.getElementById('quiz-creation-form').reset();
        tabList.click();
    });
}

// 퀴즈 리스트 목록 갱신
function updateQuizListUI() {
    const list = getQuizzes();
    const activeList = document.getElementById('quiz-active-list');
    const emptyState = document.getElementById('quiz-list-empty');

    if (list.length === 0) {
        emptyState.classList.remove('hidden');
        activeList.innerHTML = '';
        return;
    }

    emptyState.classList.add('hidden');
    activeList.innerHTML = '';

    list.forEach(q => {
        const li = document.createElement('li');
        li.className = 'quiz-item-card';

        // 유저가 정답을 맞힌 퀴즈라면 체크마크
        const isSolved = currentUser && currentUser.solvedQuizzes.includes(q.id);
        const solveBadge = isSolved ? '<span class="badge" style="background:var(--primary-light); color:var(--primary);">풀이 완료</span>' : '<span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-secondary);">미풀이</span>';

        li.innerHTML = `
            <div class="quiz-item-info">
                <span class="quiz-item-question">${q.question}</span>
                <div class="quiz-item-meta">
                    <span>출제자: <strong>${q.creator}</strong></span>
                    <span>보상: <strong>${q.reward}G</strong></span>
                    <span>${solveBadge}</span>
                </div>
            </div>
        `;

        activeList.appendChild(li);
    });
}


// ==========================================================================
// 10. NPC 크리에이터 모달 & 폼 제어
// ==========================================================================

let selectedCoords = { x: 30, y: 34 };

function setupCreatorForm() {
    const modal = document.getElementById('creator-modal');
    const openBtn = document.getElementById('btn-open-creator');
    const closeBtn = document.getElementById('btn-close-creator');
    const cancelBtn = document.getElementById('btn-cancel-creator');
    const form = document.getElementById('npc-creation-form');
    const previewCanvas = document.getElementById('avatar-preview-canvas');
    
    const skinInput = document.getElementById('color-skin');
    const hairInput = document.getElementById('color-hair');
    const outfitInput = document.getElementById('color-outfit');
    const genderInputs = document.getElementsByName('gender');
    
    function updatePreview() {
        const ctx = previewCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        
        let selectedGender = 'male';
        for (const input of genderInputs) {
            if (input.checked) selectedGender = input.value;
        }
        
        const style = {
            skinColor: skinInput.value,
            hairColor: hairInput.value,
            outfitColor: outfitInput.value,
            gender: selectedGender
        };
        
        ctx.clearRect(0, 0, 128, 128);
        ctx.save();
        ctx.scale(4, 4);
        drawPixelCharacter(ctx, style, 'down');
        ctx.restore();
        
        skinInput.nextElementSibling.innerText = skinInput.value.toUpperCase();
        hairInput.nextElementSibling.innerText = hairInput.value.toUpperCase();
        outfitInput.nextElementSibling.innerText = outfitInput.value.toUpperCase();
    }
    
    openBtn.addEventListener('click', () => {
        if (gameInstance) {
            const worldScene = gameInstance.scene.getScene('WorldScene');
            const pGridX = Math.floor(worldScene.player.x / TILE_SIZE);
            const pGridY = Math.floor(worldScene.player.y / TILE_SIZE);
            selectedCoords.x = pGridX;
            selectedCoords.y = pGridY + 1;
        }
        
        document.getElementById('picker-x').innerText = selectedCoords.x;
        document.getElementById('picker-y').innerText = selectedCoords.y;
        
        modal.classList.remove('hidden');
        updatePreview();
    });
    
    const closeModal = () => modal.classList.add('hidden');
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    
    skinInput.addEventListener('input', updatePreview);
    hairInput.addEventListener('input', updatePreview);
    outfitInput.addEventListener('input', updatePreview);
    for (const input of genderInputs) {
        input.addEventListener('change', updatePreview);
    }
    
    document.getElementById('btn-use-player-pos').addEventListener('click', () => {
        if (gameInstance) {
            const worldScene = gameInstance.scene.getScene('WorldScene');
            const pGridX = Math.floor(worldScene.player.x / TILE_SIZE);
            const pGridY = Math.floor(worldScene.player.y / TILE_SIZE);
            selectedCoords.x = pGridX;
            selectedCoords.y = pGridY;
            document.getElementById('picker-x').innerText = selectedCoords.x;
            document.getElementById('picker-y').innerText = selectedCoords.y;
        }
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = document.getElementById('npc-name-input').value.trim();
        const role = document.getElementById('npc-role-input').value.trim();
        const dialoguesText = document.getElementById('npc-dialogue-input').value.trim();
        
        if (!name || !role || !dialoguesText) return;
        
        const dialogues = dialoguesText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        if (dialogues.length === 0) return;
        
        let selectedGender = 'male';
        for (const input of genderInputs) {
            if (input.checked) selectedGender = input.value;
        }
        
        const newNpc = {
            id: 'npc_' + Date.now(),
            name: name,
            role: role,
            spriteStyle: {
                gender: selectedGender,
                skinColor: skinInput.value,
                hairColor: hairInput.value,
                outfitColor: outfitInput.value
            },
            dialogues: dialogues,
            mapX: selectedCoords.x,
            mapY: selectedCoords.y,
            createdAt: new Date().toISOString()
        };
        
        saveNPC(newNpc);
        form.reset();
        closeModal();
    });
}


// ==========================================================================
// 11. 가상 터치 조이스틱 모바일 제어
// ==========================================================================

// 활성 씬의 커서 객체를 반환 (WorldScene, IndoorScene, FantasyForestScene 공통)
function getActiveSceneCursors() {
    if (!gameInstance) return null;
    const scenes = ['WorldScene', 'IndoorScene', 'FantasyForestScene'];
    for (const name of scenes) {
        const s = gameInstance.scene.getScene(name);
        if (s && s.sys.isActive() && s.cursors) return s.cursors;
    }
    return null;
}

function getActiveScene() {
    if (!gameInstance) return null;
    const scenes = ['WorldScene', 'IndoorScene', 'FantasyForestScene'];
    for (const name of scenes) {
        const s = gameInstance.scene.getScene(name);
        if (s && s.sys.isActive()) return s;
    }
    return null;
}

function initMobileControls() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || window.innerWidth <= 1024
        || ('ontouchstart' in window)
        || (navigator.maxTouchPoints > 0);
        
    if (!isMobile) return;
    
    const controls = document.getElementById('mobile-controls');
    controls.classList.remove('hidden');
    
    const joystickBase = document.getElementById('joystick-base');
    const joystickThumb = document.getElementById('joystick-thumb');
    
    // 대화(Talk) 버튼: 활성 씬의 handleInteraction 호출
    const actionBtn = document.getElementById('action-button');
    if (actionBtn) {
        let lastActionTime = 0;
        const handleAction = (e) => {
            const now = Date.now();
            if (now - lastActionTime < 150) return;
            lastActionTime = now;
            
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            
            const scene = getActiveScene();
            if (scene && typeof scene.handleInteraction === 'function') {
                scene.handleInteraction();
            } else {
                // 대화창이 열려있으면 progressDialogue
                const dialogueBox = document.getElementById('dialogue-box');
                if (dialogueBox && !dialogueBox.classList.contains('hidden')) {
                    progressDialogue();
                }
            }
        };
        actionBtn.addEventListener('pointerdown', handleAction, { passive: false });
        actionBtn.addEventListener('touchstart', handleAction, { passive: false });
        actionBtn.addEventListener('click', handleAction);
    }
    
    // 대시(Dash) 버튼: triggerDash 호출
    const dashBtn = document.getElementById('dash-button');
    if (dashBtn) {
        const handleDash = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            const scene = getActiveScene();
            if (scene) {
                triggerDash(scene);
            }
        };
        dashBtn.addEventListener('pointerdown', handleDash, { passive: false });
        dashBtn.addEventListener('touchstart', handleDash, { passive: false });
        dashBtn.addEventListener('click', handleDash);
    }
    
    let dragging = false;
    
    joystickBase.addEventListener('touchstart', (e) => {
        dragging = true;
        updateJoystick(e.touches[0]);
    });
    
    window.addEventListener('touchmove', (e) => {
        if (!dragging) return;
        updateJoystick(e.touches[0]);
    }, { passive: false });
    
    window.addEventListener('touchend', () => {
        if (!dragging) return;
        dragging = false;
        
        joystickThumb.style.left = '50%';
        joystickThumb.style.top = '50%';
        
        const cursors = getActiveSceneCursors();
        if (cursors) {
            cursors.left.isDown = false;
            cursors.right.isDown = false;
            cursors.up.isDown = false;
            cursors.down.isDown = false;
        }
    });
    
    function updateJoystick(touch) {
        const baseRect = joystickBase.getBoundingClientRect();
        const centerX = baseRect.left + baseRect.width / 2;
        const centerY = baseRect.top + baseRect.height / 2;
        
        let deltaX = touch.clientX - centerX;
        let deltaY = touch.clientY - centerY;
        
        const maxRadius = baseRect.width / 2;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        if (distance > maxRadius) {
            deltaX = (deltaX / distance) * maxRadius;
            deltaY = (deltaY / distance) * maxRadius;
        }
        
        joystickThumb.style.left = `${50 + (deltaX / baseRect.width) * 100}%`;
        joystickThumb.style.top = `${50 + (deltaY / baseRect.height) * 100}%`;
        
        const cursors = getActiveSceneCursors();
        if (cursors) {
            const threshold = 15;
            cursors.left.isDown = deltaX < -threshold;
            cursors.right.isDown = deltaX > threshold;
            cursors.up.isDown = deltaY < -threshold;
            cursors.down.isDown = deltaY > threshold;
        }
    }
}


// ==========================================================================
// 12. 로그인 & 회원가입 시스템
// ==========================================================================

async function populateServerList() {
    const select = document.getElementById('server-select');
    if (!select) return;
    select.innerHTML = '<option value="">-- 접속할 서버를 선택하세요 --</option>';
    
    try {
        const serversRes = await callAPI('getServers');
        const servers = serversRes.servers || [];
        servers.forEach(server => {
            const opt = document.createElement('option');
            opt.value = server.id;
            opt.innerText = `${server.name} (${server.owner})`;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error("Failed to load servers:", e);
    }
}

function logoutUserForcefully() {
    currentUser = null;
    currentServer = null;
    cachedUsers = [];
    cachedNPCs = [];
    cachedQuizzes = [];
    if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
    }
    
    // 모든 모달창 닫기 및 관리자 패널 숨김
    const modals = ['creator-modal', 'shop-modal', 'inventory-modal', 'quiz-modal', 'quiz-solver-modal', 'admin-modal'];
    modals.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    const btnAdmin = document.getElementById('btn-open-admin');
    if (btnAdmin) btnAdmin.classList.add('hidden');
    
    document.getElementById('app').classList.add('hidden');
    
    const loginOverlay = document.getElementById('login-overlay');
    loginOverlay.style.opacity = 1;
    loginOverlay.classList.remove('hidden');
    document.getElementById('form-login').reset();
    document.getElementById('form-register').reset();
    document.getElementById('tab-login').click();
}

function setupLoginSystem() {
    const loginOverlay = document.getElementById('login-overlay');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');

    // 탭 전환
    tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        formLogin.classList.remove('hidden');
        formRegister.classList.add('hidden');
    });

    tabRegister.addEventListener('click', () => {
        tabLogin.classList.remove('active');
        tabRegister.classList.add('active');
        formLogin.classList.add('hidden');
        formRegister.classList.remove('hidden');
    });

    // 회원가입 제출
    formRegister.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('register-username').value.trim();
        const password = document.getElementById('register-password').value;

        if (!username || !password) return;

        try {
            const submitBtn = formRegister.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerText;
            submitBtn.disabled = true;
            submitBtn.innerText = '가입 중...';

            const accountsRes = await callAPI('getAccounts');
            const accounts = accountsRes.accounts || [];
            if (accounts.some(a => a.username === username)) {
                alert('이미 존재하는 닉네임입니다! 다른 이름으로 가입해 주세요.');
                submitBtn.disabled = false;
                submitBtn.innerText = originalText;
                return;
            }

            const newAccount = {
                username: username,
                passwordHash: hashPassword(password),
                spriteStyle: {
                    gender: Math.random() > 0.5 ? 'male' : 'female',
                    skinColor: '#ffdbac',
                    hairColor: '#455a64',
                    outfitColor: '#10b981' // 메인 칼라
                }
            };

            await callAPI('addAccount', newAccount);

            alert('가입을 환영합니다! 가입한 계정으로 로그인해 주세요.');
            formRegister.reset();
            tabLogin.click();
        } catch (err) {
            alert('가입 중 오류가 발생했습니다: ' + err.message);
        } finally {
            const submitBtn = formRegister.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = '이웃 계정 가입 완료 🏡';
            }
        }
    });

    // 로그인 제출
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;

        if (!username || !password) return;

        try {
            const submitBtn = formLogin.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerText;
            submitBtn.disabled = true;
            submitBtn.innerText = '인증 중...';

            const accountsRes = await callAPI('getAccounts');
            const accounts = accountsRes.accounts || [];
            const account = accounts.find(a => a.username === username);

            if (!account || account.passwordHash !== hashPassword(password)) {
                playSynthFail();
                alert('닉네임 또는 비밀번호가 틀렸습니다.');
                submitBtn.disabled = false;
                submitBtn.innerText = originalText;
                return;
            }

            // 로그인 성공! 임시로 currentUser에 담아두고 2단계로 진행
            currentUser = {
                username: account.username,
                spriteStyle: account.spriteStyle
            };
            playSynthDing();

            // 서버 선택 2단계 노출
            document.getElementById('server-welcome-msg').innerText = `${currentUser.username}님, 환영합니다!`;
            await populateServerList();

            document.getElementById('auth-panel').classList.add('hidden');
            document.getElementById('server-panel').classList.remove('hidden');

            // 교사 여부에 따라 서버 생성 섹션 표시
            const isTeacher = currentUser.username.startsWith('교사-');
            const createSection = document.getElementById('teacher-create-server-section');
            if (isTeacher) {
                createSection.classList.remove('hidden');
            } else {
                createSection.classList.add('hidden');
            }
        } catch (err) {
            alert('로그인 중 오류가 발생했습니다: ' + err.message);
        } finally {
            const submitBtn = formLogin.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = '다음 단계로 ➡️';
            }
        }
    });

    // 로그아웃 버튼
    document.getElementById('btn-logout').addEventListener('click', () => {
        if (confirm('게임을 종료하고 로그아웃하시겠습니까?')) {
            logoutUserForcefully();
        }
    });

    // 서버 개설 (교사 전용)
    document.getElementById('btn-create-server').addEventListener('click', async () => {
        const newNameInput = document.getElementById('new-server-name');
        const name = newNameInput.value.trim();
        if (!name) {
            alert('개설할 서버 이름을 입력해주세요.');
            return;
        }

        try {
            const btn = document.getElementById('btn-create-server');
            btn.disabled = true;
            btn.innerText = '개설 중...';

            const serversRes = await callAPI('getServers');
            const servers = serversRes.servers || [];
            if (servers.some(s => s.name === name)) {
                alert('이미 존재하는 서버 이름입니다. 다른 이름을 사용해주세요.');
                btn.disabled = false;
                btn.innerText = '개설하기';
                return;
            }

            const newServer = {
                id: 'server_' + Date.now(),
                name: name,
                owner: currentUser.username,
                createdAt: new Date().toISOString()
            };

            await callAPI('addServer', newServer);

            newNameInput.value = '';
            await populateServerList();

            // 방금 만든 서버 자동 선택
            document.getElementById('server-select').value = newServer.id;
            showHUDMessage(`🌐 서버 '${name}' 개설 완료!`);
        } catch (err) {
            alert('서버 개설 중 오류가 발생했습니다: ' + err.message);
        } finally {
            const btn = document.getElementById('btn-create-server');
            if (btn) {
                btn.disabled = false;
                btn.innerText = '개설하기';
            }
        }
    });

    // 이전 버튼 (서버 선택 -> 로그인)
    document.getElementById('btn-back-to-auth').addEventListener('click', () => {
        document.getElementById('server-panel').classList.add('hidden');
        document.getElementById('auth-panel').classList.remove('hidden');
        formLogin.reset();
        formRegister.reset();
        tabLogin.click();
    });

    // 마을 탐험 입장 (선택된 서버 데이터 연동 및 시작)
    document.getElementById('btn-connect-server').addEventListener('click', async () => {
        const select = document.getElementById('server-select');
        const serverId = select.value;
        if (!serverId) {
            alert('접속할 서버를 선택해 주세요.');
            return;
        }

        try {
            const btn = document.getElementById('btn-connect-server');
            const originalText = btn.innerText;
            btn.disabled = true;
            btn.innerText = '접속 중...';

            const serversRes = await callAPI('getServers');
            const servers = serversRes.servers || [];
            const server = servers.find(s => s.id === serverId);
            if (!server) {
                alert('존재하지 않는 서버입니다.');
                btn.disabled = false;
                btn.innerText = originalText;
                return;
            }

            currentServer = server;

            // 로딩 안내 노출
            showHUDMessage("🌐 스프레드시트 서버 데이터 로딩 중...");

            // 리모트 API로 데이터 fetch
            const [usersRes, npcsRes, quizzesRes] = await Promise.all([
                callAPI('getUsers', { serverId: currentServer.id }),
                callAPI('getNPCs', { serverId: currentServer.id }),
                callAPI('getQuizzes', { serverId: currentServer.id })
            ]);

            cachedUsers = usersRes.users || [];
            cachedNPCs = npcsRes.npcs || [];
            cachedQuizzes = quizzesRes.quizzes || [];

            // 새 서버일 경우 디폴트 NPC/퀴즈 자동 생성 연동
            if (cachedNPCs.length === 0) {
                cachedNPCs = [...DEFAULT_NPCS];
                for (const npc of DEFAULT_NPCS) {
                    await callAPI('saveNPC', { serverId: currentServer.id, npc: npc });
                }
            }
            if (cachedQuizzes.length === 0) {
                cachedQuizzes = [...DEFAULT_QUIZZES];
                for (const quiz of DEFAULT_QUIZZES) {
                    await callAPI('saveQuiz', { serverId: currentServer.id, quiz: quiz });
                }
            }

            // 서버 프로필 로드 또는 생성
            let profile = cachedUsers.find(u => u.username === currentUser.username);
            if (!profile) {
                profile = {
                    username: currentUser.username,
                    gold: 150,
                    inventory: [],
                    equipped: [],
                    solvedQuizzes: [],
                    spriteStyle: currentUser.spriteStyle
                };
                cachedUsers.push(profile);
                await callAPI('saveUser', { serverId: currentServer.id, user: profile });
            }

            currentUser = profile;

            // HUD 및 UI 업데이트
            document.getElementById('hud-server-name').innerText = currentServer.name;
            await syncCurrentUser();
            updateSidebarNPCList();
            updateQuizListUI();

            // 백그라운드 15초 동기화 시작
            startBackgroundSync();

            // 로그인 창 숨기기 및 월드 시작
            loginOverlay.style.transition = 'opacity 0.4s ease';
            loginOverlay.style.opacity = 0;
            setTimeout(() => {
                loginOverlay.classList.add('hidden');
                document.getElementById('app').classList.remove('hidden');

                // 앱 UI가 표시된 후 Phaser 엔진 시작 (검은 화면 방지)
                if (!gameInstance) {
                    startGameEngine();
                    // 씬이 완전히 로드된 후 플레이어 위치 및 스킨 설정
                    setTimeout(() => {
                        const worldScene = gameInstance && gameInstance.scene.getScene('WorldScene');
                        if (worldScene && worldScene.player) {
                            worldScene.player.setPosition(30 * TILE_SIZE + 16, 33 * TILE_SIZE + 16);
                            worldScene.spawnNPCs();
                            worldScene.refreshPlayerSkin();
                        }
                        drawMinimap(30, 33);
                    }, 800);
                } else {
                    startGameEngine(); // 씬 재시작
                    setTimeout(() => {
                        const worldScene = gameInstance && gameInstance.scene.getScene('WorldScene');
                        if (worldScene && worldScene.player) {
                            worldScene.player.setPosition(30 * TILE_SIZE + 16, 33 * TILE_SIZE + 16);
                            worldScene.spawnNPCs();
                            worldScene.refreshPlayerSkin();
                        }
                        drawMinimap(30, 33);
                    }, 600);
                }
            }, 400);
        } catch (err) {
            alert('서버 접속 중 오류가 발생했습니다: ' + err.message);
        } finally {
            const btn = document.getElementById('btn-connect-server');
            if (btn) {
                btn.disabled = false;
                btn.innerText = '마을 탐험 입장 🚶';
            }
        }
    });
}



// ==========================================================================
// 13. UI 알림 효과 헬퍼
// ==========================================================================

function showHUDMessage(text) {
    const notify = document.createElement('div');
    notify.className = 'hud-gold-toast';
    notify.innerText = text;
    
    // 스타일 지정
    Object.assign(notify.style, {
        position: 'fixed',
        bottom: '100px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(15, 23, 42, 0.9)',
        border: '1px solid var(--primary)',
        color: '#fff',
        padding: '12px 24px',
        borderRadius: '10px',
        fontFamily: 'Galmuri9, monospace',
        fontSize: '13px',
        zIndex: 99999,
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: 'none'
    });
    
    document.body.appendChild(notify);
    
    setTimeout(() => {
        notify.style.transition = 'all 0.3s ease';
        notify.style.opacity = 0;
        notify.style.transform = 'translate(-50%, -20px)';
        setTimeout(() => notify.remove(), 300);
    }, 2500);
}

// ==========================================================================
// 13.5 교사 관리자 패널 시스템 & 다중 탭 동기화
// ==========================================================================

// Phaser 키보드 입력 가로채기 방지 (입력 필드 포커스 시 spacebar 등 키 캡처 방지)
window.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        e.stopPropagation();
    }
}, true);

window.addEventListener('keyup', (e) => {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        e.stopPropagation();
    }
}, true);

function setupAdminPanel() {
    const adminModal = document.getElementById('admin-modal');
    const btnOpenAdmin = document.getElementById('btn-open-admin');
    const btnCloseAdmin = document.getElementById('btn-close-admin');
    
    if (btnOpenAdmin) {
        btnOpenAdmin.addEventListener('click', () => {
            adminModal.classList.remove('hidden');
            // 기본 탭 선택
            document.getElementById('tab-admin-students').click();
        });
    }
    
    if (btnCloseAdmin) {
        btnCloseAdmin.addEventListener('click', () => {
            adminModal.classList.add('hidden');
        });
    }
    
    // 탭 제어
    const tabStudents = document.getElementById('tab-admin-students');
    const tabQuizzes = document.getElementById('tab-admin-quizzes');
    const tabNpcs = document.getElementById('tab-admin-npcs');
    
    const sectionStudents = document.getElementById('admin-students-section');
    const sectionQuizzes = document.getElementById('admin-quizzes-section');
    const sectionNpcs = document.getElementById('admin-npcs-section');
    
    if (tabStudents && tabQuizzes && tabNpcs) {
        tabStudents.addEventListener('click', () => {
            tabStudents.classList.add('active');
            tabQuizzes.classList.remove('active');
            tabNpcs.classList.remove('active');
            
            sectionStudents.classList.remove('hidden');
            sectionQuizzes.classList.add('hidden');
            sectionNpcs.classList.add('hidden');
            
            renderAdminStudents();
        });
        
        tabQuizzes.addEventListener('click', () => {
            tabStudents.classList.remove('active');
            tabQuizzes.classList.add('active');
            tabNpcs.classList.remove('active');
            
            sectionStudents.classList.add('hidden');
            sectionQuizzes.classList.remove('hidden');
            sectionNpcs.classList.add('hidden');
            
            renderAdminQuizzes();
        });
        
        tabNpcs.addEventListener('click', () => {
            tabStudents.classList.remove('active');
            tabQuizzes.classList.remove('active');
            tabNpcs.classList.add('active');
            
            sectionStudents.classList.add('hidden');
            sectionQuizzes.classList.add('hidden');
            sectionNpcs.classList.remove('hidden');
            
            renderAdminNPCs();
        });
    }

    // 학생 일괄 골드 지급 이벤트 바인딩
    const btnGiveAllGold = document.getElementById('btn-admin-give-all-gold');
    if (btnGiveAllGold) {
        btnGiveAllGold.addEventListener('click', async () => {
            const amtStr = prompt('모든 학생에게 지급할 일괄 골드 양을 입력하세요:', '100');
            if (amtStr === null) return;
            const amt = parseInt(amtStr);
            if (isNaN(amt) || amt <= 0) {
                alert('올바른 숫자를 입력해주세요.');
                return;
            }
            let count = 0;
            cachedUsers.forEach(u => {
                if (!u.username.startsWith('교사-')) {
                    u.gold = (u.gold || 0) + amt;
                    count++;
                }
            });
            if (count > 0) {
                renderAdminStudents();
                showHUDMessage(`💰 모든 학생(${count}명)에게 ${amt}G를 지급했습니다!`);
                
                try {
                    const studentsToSave = cachedUsers.filter(u => !u.username.startsWith('교사-'));
                    await enqueueAPI('saveUsersBulk', { serverId: currentServer.id, users: studentsToSave });
                } catch (e) {
                    console.error("Failed to bulk save users remotely:", e);
                }
            } else {
                alert('지급할 학생이 없습니다.');
            }
        });
    }


    // 관리자 NPC 추가/수정 폼 바인딩
    const npcTrigger = document.getElementById('btn-admin-add-npc-trigger');
    const npcFormSection = document.getElementById('admin-npc-form-section');
    const npcForm = document.getElementById('admin-npc-form');
    const npcCancelBtn = document.getElementById('btn-admin-npc-cancel');
    const npcTitle = document.getElementById('admin-npc-form-title');
    
    if (npcTrigger) {
        npcTrigger.addEventListener('click', () => {
            npcFormSection.classList.remove('hidden');
            npcTitle.innerText = '📝 새 이웃 추가';
            npcForm.reset();
            document.getElementById('admin-npc-edit-id').value = '';
        });
    }
    
    if (npcCancelBtn) {
        npcCancelBtn.addEventListener('click', () => {
            npcFormSection.classList.add('hidden');
        });
    }
    
    if (npcForm) {
        npcForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const editId = document.getElementById('admin-npc-edit-id').value;
            const name = document.getElementById('admin-npc-name').value.trim();
            const role = document.getElementById('admin-npc-role').value.trim();
            const x = parseInt(document.getElementById('admin-npc-x').value);
            const y = parseInt(document.getElementById('admin-npc-y').value);
            const gender = document.getElementById('admin-npc-gender').value;
            const skin = document.getElementById('admin-npc-color-skin').value;
            const hair = document.getElementById('admin-npc-color-hair').value;
            const outfit = document.getElementById('admin-npc-color-outfit').value;
            const dialoguesText = document.getElementById('admin-npc-dialogues').value.trim();
            
            const dialogues = dialoguesText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            if (dialogues.length === 0) {
                alert('대화 대사를 입력해 주세요.');
                return;
            }
            
            const targetNPC = {
                id: editId || 'npc_' + Date.now(),
                name: name,
                role: role,
                mapX: x,
                mapY: y,
                spriteStyle: { gender, skinColor: skin, hairColor: hair, outfitColor: outfit },
                dialogues: dialogues,
                createdAt: editId ? (cachedNPCs.find(n => n.id === editId)?.createdAt || new Date().toISOString()) : new Date().toISOString()
            };
            
            saveNPC(targetNPC);
            
            if (editId) {
                showHUDMessage(`✏️ 이웃 '${name}' 정보가 수정되었습니다!`);
            }
            
            npcForm.reset();
            npcFormSection.classList.add('hidden');
            
            renderAdminNPCs();
        });
    }

}



function renderAdminNPCs() {
    const listBody = document.getElementById('admin-npcs-list');
    if (!listBody) return;
    listBody.innerHTML = '';
    
    const npcs = getNPCs();
    
    if (npcs.length === 0) {
        listBody.innerHTML = `<tr><td colspan="5" class="empty-state" style="text-align:center; padding: 20px;">등록된 이웃(NPC)이 없습니다.</td></tr>`;
        return;
    }
    
    npcs.forEach(npc => {
        const tr = document.createElement('tr');
        const regTimeStr = npc.createdAt ? new Date(npc.createdAt).toLocaleString('ko-KR', { hour12: false }) : '기본 이웃';
        
        tr.innerHTML = `
            <td>
                <div style="display:flex; align-items:center; gap:8px;">
                    <canvas id="canvas-admin-npc-${npc.id}" width="32" height="32" style="width:24px; height:24px; image-rendering:pixelated;"></canvas>
                    <strong>${npc.name}</strong>
                </div>
            </td>
            <td>${npc.role}</td>
            <td>X: ${npc.mapX}, Y: ${npc.mapY}</td>
            <td style="font-size: 11px; color: var(--text-secondary);">${regTimeStr}</td>
            <td>
                <button class="btn btn-secondary btn-sm btn-teleport-npc" data-x="${npc.mapX}" data-y="${npc.mapY}">🚶 순간이동</button>
                <button class="btn btn-warning btn-sm btn-edit-npc" data-id="${npc.id}">✏️ 수정</button>
                <button class="btn btn-danger btn-sm btn-delete-npc" data-id="${npc.id}">🗑️ 삭제</button>
            </td>
        `;
        
        listBody.appendChild(tr);
        
        // 미니 아바타 드로잉
        const canvas = document.getElementById(`canvas-admin-npc-${npc.id}`);
        if (canvas) {
            drawPixelCharacter(canvas.getContext('2d'), npc.spriteStyle, 'down');
        }
        
        // 순간이동
        tr.querySelector('.btn-teleport-npc').addEventListener('click', () => {
            if (gameInstance) {
                gameInstance.scene.getScene('WorldScene').teleportTo(npc.mapX, npc.mapY);
                document.getElementById('admin-modal').classList.add('hidden');
                showHUDMessage(`🚶 '${npc.name}' 위치로 순간이동했습니다.`);
            }
        });
        
        // 수정
        tr.querySelector('.btn-edit-npc').addEventListener('click', () => {
            const formSection = document.getElementById('admin-npc-form-section');
            formSection.classList.remove('hidden');
            
            document.getElementById('admin-npc-form-title').innerText = '✏️ 이웃 수정';
            document.getElementById('admin-npc-edit-id').value = npc.id;
            document.getElementById('admin-npc-name').value = npc.name;
            document.getElementById('admin-npc-role').value = npc.role;
            document.getElementById('admin-npc-x').value = npc.mapX;
            document.getElementById('admin-npc-y').value = npc.mapY;
            document.getElementById('admin-npc-gender').value = npc.spriteStyle.gender || 'male';
            document.getElementById('admin-npc-color-skin').value = npc.spriteStyle.skinColor || '#ffdbac';
            document.getElementById('admin-npc-color-hair').value = npc.spriteStyle.hairColor || '#5d4037';
            document.getElementById('admin-npc-color-outfit').value = npc.spriteStyle.outfitColor || '#37474f';
            document.getElementById('admin-npc-dialogues').value = npc.dialogues.join('\n');
            
            formSection.scrollIntoView({ behavior: 'smooth' });
        });
        
        // 삭제
        tr.querySelector('.btn-delete-npc').addEventListener('click', () => {
            if (!confirm(`이웃 '${npc.name}'을 정말로 동네에서 삭제하시겠습니까?`)) return;
            deleteNPC(npc.id);
            renderAdminNPCs();
            showHUDMessage(`🗑️ 이웃 '${npc.name}'을 삭제했습니다.`);
        });
    });
}

// 다중 탭 실시간 동기화용 수신 함수들
// 퀴즈 탭 활성화 시 수정 바인딩 처리 추가 및 퀴즈 렌더링 수정
function renderAdminQuizzes() {
    const listBody = document.getElementById('admin-quizzes-list');
    if (!listBody) return;
    listBody.innerHTML = '';
    
    const quizzes = getQuizzes();
    
    if (quizzes.length === 0) {
        listBody.innerHTML = `<tr><td colspan="6" class="empty-state" style="text-align:center; padding: 20px;">등록된 퀴즈가 없습니다.</td></tr>`;
        return;
    }
    
    quizzes.forEach(quiz => {
        const tr = document.createElement('tr');
        const optionsText = quiz.options.map((opt, idx) => `${idx + 1}: ${opt}`).join(', ');
        const correctText = quiz.options[quiz.correctIndex] || `인덱스 ${quiz.correctIndex}`;
        
        tr.innerHTML = `
            <td>${quiz.question}</td>
            <td><strong>${quiz.creator}</strong></td>
            <td style="font-size: 11px;">${optionsText}</td>
            <td><span class="badge" style="background:var(--primary-light); color:var(--primary); font-size:11px;">${correctText}</span></td>
            <td>💰 ${quiz.reward}G</td>
            <td>
                <button class="btn btn-secondary btn-sm btn-edit-quiz" data-id="${quiz.id}">✏️ 수정</button>
                <button class="btn btn-danger btn-sm btn-delete-quiz" data-id="${quiz.id}">🗑️ 삭제</button>
            </td>
        `;
        
        // 수정 바인딩
        tr.querySelector('.btn-edit-quiz').addEventListener('click', () => {
            const formSection = document.getElementById('admin-quiz-form-section');
            formSection.classList.remove('hidden');
            
            document.getElementById('admin-quiz-form-title').innerText = '✏️ 퀴즈 수정';
            document.getElementById('admin-quiz-edit-id').value = quiz.id;
            document.getElementById('admin-quiz-question').value = quiz.question;
            document.getElementById('admin-quiz-opt-0').value = quiz.options[0] || '';
            document.getElementById('admin-quiz-opt-1').value = quiz.options[1] || '';
            document.getElementById('admin-quiz-opt-2').value = quiz.options[2] || '';
            document.getElementById('admin-quiz-opt-3').value = quiz.options[3] || '';
            document.getElementById('admin-quiz-correct').value = quiz.correctIndex;
            document.getElementById('admin-quiz-reward').value = quiz.reward;
            
            formSection.scrollIntoView({ behavior: 'smooth' });
        });

        tr.querySelector('.btn-delete-quiz').addEventListener('click', async () => {
            if (!confirm(`이 퀴즈를 삭제하시겠습니까?\n"${quiz.question}"`)) return;
            cachedQuizzes = cachedQuizzes.filter(q => q.id !== quiz.id);
            
            updateQuizListUI();
            renderAdminQuizzes();
            showHUDMessage('🗑️ 퀴즈를 삭제했습니다.');
            
            try {
                await enqueueAPI('deleteQuiz', { serverId: currentServer.id, id: quiz.id });
            } catch (e) {
                console.error("Failed to delete quiz remotely:", e);
            }
        });
        
        listBody.appendChild(tr);
    });
}

function renderAdminStudents() {
    const listBody = document.getElementById('admin-students-list');
    if (!listBody) return;
    listBody.innerHTML = '';
    
    const students = getUsers().filter(u => !u.username.startsWith('교사-'));
    
    if (students.length === 0) {
        listBody.innerHTML = `<tr><td colspan="6" class="empty-state" style="text-align:center; padding: 20px;">가입된 학생이 없습니다.</td></tr>`;
        return;
    }
    
    students.forEach(student => {
        const tr = document.createElement('tr');
        
        // 장착 아이템 이름 변환
        const equippedNames = student.equipped.map(itemId => {
            const item = SHOP_ITEMS.find(i => i.id === itemId);
            return item ? item.name : itemId;
        }).join(', ') || '없음';
        
        tr.innerHTML = `
            <td><strong>${student.username}</strong></td>
            <td>💰 ${student.gold}G</td>
            <td>${student.inventory.length}개</td>
            <td>${equippedNames}</td>
            <td>✅ ${student.solvedQuizzes.length}개</td>
            <td>
                <button class="btn btn-primary btn-sm btn-give-gold" data-username="${student.username}">💰 지급</button>
                <button class="btn btn-warning btn-sm btn-edit-student" data-username="${student.username}">✏️ 수정</button>
                <button class="btn btn-secondary btn-sm btn-reset-student" data-username="${student.username}">🔄 초기화</button>
                <button class="btn btn-danger btn-sm btn-delete-student" data-username="${student.username}">🗑️ 삭제</button>
            </td>
        `;
        
        // 골드 지급 버튼
        tr.querySelector('.btn-give-gold').addEventListener('click', async () => {
            const amtStr = prompt(`'${student.username}' 학생에게 지급할 골드 양을 입력하세요:`, '100');
            if (amtStr === null) return;
            const amt = parseInt(amtStr);
            if (isNaN(amt) || amt <= 0) {
                alert('올바른 숫자를 입력해주세요.');
                return;
            }
            const idx = cachedUsers.findIndex(u => u.username === student.username);
            if (idx !== -1) {
                cachedUsers[idx].gold = (cachedUsers[idx].gold || 0) + amt;
                
                renderAdminStudents();
                showHUDMessage(`💰 ${student.username} 학생에게 ${amt}G를 지급했습니다!`);
                
                try {
                    await enqueueAPI('saveUser', { serverId: currentServer.id, user: cachedUsers[idx] });
                } catch (e) {
                    console.error("Failed to save user remotely:", e);
                }
            }
        });
        
        // 골드 수정 버튼
        tr.querySelector('.btn-edit-student').addEventListener('click', async () => {
            const amtStr = prompt(`'${student.username}' 학생의 보유 골드를 수정할 양으로 설정하세요:`, student.gold);
            if (amtStr === null) return;
            const amt = parseInt(amtStr);
            if (isNaN(amt) || amt < 0) {
                alert('올바른 숫자를 입력해주세요.');
                return;
            }
            const idx = cachedUsers.findIndex(u => u.username === student.username);
            if (idx !== -1) {
                cachedUsers[idx].gold = amt;
                
                renderAdminStudents();
                showHUDMessage(`✏️ ${student.username} 학생의 보유 골드를 ${amt}G로 수정했습니다!`);
                
                try {
                    await enqueueAPI('saveUser', { serverId: currentServer.id, user: cachedUsers[idx] });
                } catch (e) {
                    console.error("Failed to save user remotely:", e);
                }
            }
        });
        
        // 초기화 버튼
        tr.querySelector('.btn-reset-student').addEventListener('click', async () => {
            if (!confirm(`'${student.username}' 학생의 데이터를 초기화하시겠습니까?\n(골드 150G로 설정, 인벤토리/장착 장비/해결 퀴즈 초기화)`)) return;
            const idx = cachedUsers.findIndex(u => u.username === student.username);
            if (idx !== -1) {
                cachedUsers[idx].gold = 150;
                cachedUsers[idx].inventory = [];
                cachedUsers[idx].equipped = [];
                cachedUsers[idx].solvedQuizzes = [];
                
                renderAdminStudents();
                showHUDMessage(`🔄 ${student.username} 학생의 데이터를 초기화했습니다.`);
                
                try {
                    await enqueueAPI('saveUser', { serverId: currentServer.id, user: cachedUsers[idx] });
                } catch (e) {
                    console.error("Failed to reset student remotely:", e);
                }
            }
        });
        
        // 삭제 버튼
        tr.querySelector('.btn-delete-student').addEventListener('click', async () => {
            if (!confirm(`정말로 '${student.username}' 학생 계정을 영구 삭제하시겠습니까?`)) return;
            cachedUsers = cachedUsers.filter(u => u.username !== student.username);
            
            renderAdminStudents();
            showHUDMessage(`🗑️ ${student.username} 학생 계정을 삭제했습니다.`);
            
            try {
                await enqueueAPI('deleteUser', { serverId: currentServer.id, username: student.username });
            } catch (e) {
                console.error("Failed to delete student remotely:", e);
            }
        });
        
        listBody.appendChild(tr);
    });
}


// ==========================================================================
// 13.6 돌발 선물 상자 버프 시스템 & 실내/차원 이동 씬 정의
// ==========================================================================

let activeBuffs = {
    giant: false,
    mini: false,
    magnet: false,
    shield: false,
    boost: false,
    invisible: false,
    freeze: false,
    lucky: false,
    autoGold: false,
    gravity: false,
    ghost: false,
    confusion: false,
    speedDown: false,
    timer: 0
};

// 보트 탑승 상태 관리
let onBoat = false;

// 대시 상태 관리 (토끼 머리띠)
let dashCooldown = 0;
let dashActiveTimer = 0;
let dashDirX = 0;
let dashDirY = 0;

function triggerDash(scene) {
    if (!currentUser || !currentUser.equipped.includes('item_bunny')) return;
    if (dashCooldown > 0) return;
    if (scene.isInteracting) return;
    
    // Check if player is moving
    let vx = scene.player.body.velocity.x;
    let vy = scene.player.body.velocity.y;
    if (vx === 0 && vy === 0) return;
    
    // Normalize moving direction
    const len = Math.sqrt(vx * vx + vy * vy);
    dashDirX = vx / len;
    dashDirY = vy / len;
    
    dashActiveTimer = 200; // 200ms
    dashCooldown = 3; // 3 seconds
    
    playBeepSound(); // Play synth whoosh
    
    // Show visual dash effect: floating text
    const fText = scene.add.text(scene.player.x, scene.player.y - 20, 'DASH! 🐰', {
        fontFamily: 'Galmuri9, monospace',
        fontSize: '11px',
        color: '#f472b6',
        stroke: '#000000',
        strokeThickness: 2
    });
    fText.setOrigin(0.5, 0.5);
    fText.setDepth(20000);
    scene.tweens.add({
        targets: fText,
        y: scene.player.y - 50,
        alpha: 0,
        duration: 500,
        onComplete: () => fText.destroy()
    });
    updateDashButtonCooldown();
}

function updateDashButtonCooldown() {
    const btn = document.getElementById('dash-button');
    if (!btn) return;
    if (dashCooldown > 0) {
        btn.innerText = `${dashCooldown}s`;
        btn.style.opacity = '0.5';
    } else {
        btn.innerText = 'Dash';
        btn.style.opacity = '1';
    }
}

function activateBuff(type) {
    if (type === 'teleport') {
        let cx = 30, cy = 34;
        for (let attempts = 0; attempts < 50; attempts++) {
            const tx = Math.floor(Math.random() * (MAP_WIDTH - 4)) + 2;
            const ty = Math.floor(Math.random() * (MAP_HEIGHT - 4)) + 2;
            if (obstaclesMap[ty][tx] === 0 && mapData[ty][tx] !== 3) {
                cx = tx; cy = ty;
                break;
            }
        }
        if (gameInstance) {
            const worldScene = gameInstance.scene.getScene('WorldScene');
            if (worldScene && worldScene.player) {
                worldScene.cameras.main.flash(300, 255, 255, 255);
                worldScene.player.setPosition(cx * 32 + 16, cy * 32 + 16);
            }
        }
        showHUDMessage('✨ 무작위 위치로 순간이동 되었습니다!');
        return; // No duration needed
    }

    if (type === 'lucky') {
        const bonus = Phaser.Math.Between(50, 200);
        showHUDMessage(`🍀 행운! 잭팟이 터졌습니다! (+${bonus}G)`);
        if (currentUser) {
            currentUser.gold += bonus;
            syncCurrentUser();
            applyPhaserBuffVisuals('lucky');
        }
        return;
    }

    // 이전 버프 해제
    Object.keys(activeBuffs).filter(k => k !== 'timer').forEach(k => activeBuffs[k] = false);
    
    activeBuffs[type] = true;
    
    // 탐험가 배낭 장착 시 버프 지속시간 2배 (30초)
    const duration = (currentUser && currentUser.equipped.includes('item_backpack')) ? 30 : 15;
    activeBuffs.timer = duration;
    
    applyPhaserBuffVisuals(type);
    
    showHUDMessage(`🎁 [${getBuffName(type)}] 버프 발동! (${duration}초 지속)`);
    updateBuffHUD();
}

function getBuffName(type) {
    switch(type) {
        case 'giant': return '🐘 거인화';
        case 'mini': return '🐜 미니화';
        case 'magnet': return '🧲 동전 자석';
        case 'shield': return '🛡️ 골드 2배';
        case 'boost': return '🚀 초고속 부스터';
        case 'invisible': return '👻 투명인간';
        case 'freeze': return '❄️ 주변 동결';
        case 'autoGold': return '🪙 골드 연금술';
        case 'gravity': return '🌌 유체 이탈 (장애물 통과)';
        case 'ghost': return '👻 유령화 (벽/물 통과)';
        case 'confusion': return '🌀 혼란 (방향키 반전)';
        case 'speedDown': return '🐢 거북이 (속도 감소)';
        default: return '✨ 특수효과';
    }
}

function applyPhaserBuffVisuals(type) {
    if (!gameInstance) return;
    
    const activeScene = getActiveScene();
    if (!activeScene || !activeScene.player) return;
    
    activeScene.player.setScale(1);
    activeScene.player.setAlpha(1);
    activeScene.player.clearTint();
    
    if (activeBuffs.ghost) {
        activeScene.player.setAlpha(0.4);
    }
    
    if (onBoat) {
        activeScene.player.setTexture('obj-boat');
        activeScene.player.setScale(1.2);
    } else {
        activeScene.player.setTexture('player');
    }
    
    if (type === 'giant') {
        activeScene.player.setScale(2.2);
    } else if (type === 'mini') {
        activeScene.player.setScale(0.5);
    } else if (type === 'shield') {
        activeScene.player.setTint(0x67e8f9);
    } else if (type === 'boost') {
        activeScene.player.setTint(0xfca5a5);
    } else if (type === 'magnet') {
        activeScene.player.setTint(0xfef08a);
    } else if (type === 'invisible') {
        activeScene.player.setAlpha(0.25);
    } else if (type === 'freeze') {
        activeScene.player.setTint(0xa5f3fc);
    } else if (type === 'speedDown') {
        activeScene.player.setTint(0xa3e635);
    } else if (type === 'confusion') {
        activeScene.player.setTint(0xc084fc);
    } else if (type === 'autoGold') {
        activeScene.player.setTint(0xfcd34d); // Shiny gold tint
    } else if (type === 'gravity') {
        activeScene.player.setAlpha(0.6); // Semitransparent
        activeScene.player.setTint(0xc084fc); // Purple tint
    }
}

// 매 1초마다 버프 타이머 업데이트 및 만료 처리
let passiveGoldTimer = 0;
let starWandTimer = 0;

setInterval(() => {
    // 대시 쿨다운 감소
    if (dashCooldown > 0) {
        dashCooldown = Math.max(0, dashCooldown - 1);
        updateDashButtonCooldown();
    }

    // 천사 링 패시브 골드 지급 (5초마다 +2G)
    if (currentUser && currentUser.equipped.includes('item_halo')) {
        passiveGoldTimer++;
        if (passiveGoldTimer >= 5) {
            passiveGoldTimer = 0;
            currentUser.gold += 2;
            syncCurrentUser();
            
            const activeScene = getActiveScene();
            if (activeScene && activeScene.player) {
                const fText = activeScene.add.text(activeScene.player.x, activeScene.player.y - 18, `+2G 👼`, {
                    fontFamily: 'Galmuri9, monospace',
                    fontSize: '10px',
                    color: '#e0f2fe',
                    stroke: '#0369a1',
                    strokeThickness: 2
                });
                fText.setOrigin(0.5, 0.5);
                fText.setDepth(20000);
                activeScene.tweens.add({
                    targets: fText,
                    y: activeScene.player.y - 48,
                    alpha: 0,
                    duration: 800,
                    onComplete: () => fText.destroy()
                });
            }
        }
    }

    // 별빛 지팡이 패시브 스폰 (15초마다 동전 1개 추가 생성)
    if (currentUser && currentUser.equipped.includes('item_star_wand')) {
        starWandTimer++;
        if (starWandTimer >= 15) {
            starWandTimer = 0;
            const activeScene = getActiveScene();
            if (activeScene && activeScene.scene.key === 'WorldScene') {
                activeScene.spawnRandomCoin();
                showHUDMessage('⭐ 별빛 지팡이가 하늘의 별을 하나 떨어뜨렸습니다!');
            } else if (activeScene && activeScene.scene.key === 'FantasyForestScene') {
                activeScene.spawnMagicalStar();
                showHUDMessage('⭐ 별빛 지팡이가 숲속에 별을 하나 소환했습니다!');
            }
        }
    }

    if (activeBuffs.timer > 0) {
        activeBuffs.timer--;
        
        // 골드 연금술 버프 처리 (매초 +5G)
        if (activeBuffs.autoGold) {
            if (currentUser) {
                currentUser.gold += 5;
                syncCurrentUser();
                
                const activeScene = getActiveScene();
                if (activeScene && activeScene.player) {
                    const fText = activeScene.add.text(activeScene.player.x, activeScene.player.y - 15, `+5G 🪙`, {
                        fontFamily: 'Galmuri9, monospace',
                        fontSize: '10px',
                        color: '#fbbf24',
                        stroke: '#000000',
                        strokeThickness: 2
                    });
                    fText.setOrigin(0.5, 0.5);
                    fText.setDepth(20000);
                    activeScene.tweens.add({
                        targets: fText,
                        y: activeScene.player.y - 45,
                        alpha: 0,
                        duration: 800,
                        onComplete: () => fText.destroy()
                    });
                }
            }
        }

        updateBuffHUD();
        
        if (activeBuffs.timer === 0) {
            const activeType = Object.keys(activeBuffs).find(k => activeBuffs[k] === true && k !== 'timer');
            if (activeType) {
                activeBuffs[activeType] = false;
                applyPhaserBuffVisuals(null);
                showHUDMessage(`⏳ [${getBuffName(activeType)}] 효과가 만료되었습니다.`);
            }
            updateBuffHUD();
        }
    }
}, 1000);

function updateBuffHUD() {
    let buffBar = document.getElementById('hud-buff-bar');
    if (!buffBar) {
        const hud = document.getElementById('user-hud');
        if (hud) {
            buffBar = document.createElement('span');
            buffBar.id = 'hud-buff-bar';
            buffBar.style.cssText = 'background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; margin-right: 5px; font-family: Galmuri9, monospace; display: none; align-items: center;';
            hud.insertBefore(buffBar, hud.querySelector('#btn-open-shop'));
        }
    }
    
    if (!buffBar) return;
    
    const activeType = Object.keys(activeBuffs).find(k => activeBuffs[k] === true && k !== 'timer');
    if (activeType && activeBuffs.timer > 0) {
        buffBar.style.display = 'inline-flex';
        buffBar.innerText = `${getBuffName(activeType)} (${activeBuffs.timer}초)`;
    } else {
        buffBar.style.display = 'none';
    }
}

// 관리자 퀴즈 추가/수정 폼 바인딩
function setupAdminQuizForm() {
    const trigger = document.getElementById('btn-admin-add-quiz-trigger');
    const formSection = document.getElementById('admin-quiz-form-section');
    const form = document.getElementById('admin-quiz-form');
    const cancelBtn = document.getElementById('btn-admin-quiz-cancel');
    const title = document.getElementById('admin-quiz-form-title');
    
    if (trigger) {
        trigger.addEventListener('click', () => {
            formSection.classList.remove('hidden');
            title.innerText = '📝 새 퀴즈 추가';
            form.reset();
            document.getElementById('admin-quiz-edit-id').value = '';
        });
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            formSection.classList.add('hidden');
        });
    }
    
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const editId = document.getElementById('admin-quiz-edit-id').value;
            const question = document.getElementById('admin-quiz-question').value.trim();
            const opts = [
                document.getElementById('admin-quiz-opt-0').value.trim(),
                document.getElementById('admin-quiz-opt-1').value.trim(),
                document.getElementById('admin-quiz-opt-2').value.trim(),
                document.getElementById('admin-quiz-opt-3').value.trim()
            ];
            const correctIndex = parseInt(document.getElementById('admin-quiz-correct').value);
            const reward = parseInt(document.getElementById('admin-quiz-reward').value);
            
            const targetQuiz = {
                id: editId || 'quiz_' + Date.now(),
                creator: editId ? (cachedQuizzes.find(q => q.id === editId)?.creator || '교사') : (currentUser ? currentUser.username : '교사'),
                question: question,
                options: opts,
                correctIndex: correctIndex,
                reward: reward
            };
            
            saveQuiz(targetQuiz);
            
            if (editId) {
                showHUDMessage('✏️ 퀴즈가 성공적으로 수정되었습니다!');
            } else {
                showHUDMessage('❓ 새 퀴즈가 성공적으로 출제되었습니다!');
            }
            
            form.reset();
            formSection.classList.add('hidden');
            
            renderAdminQuizzes();
        });
    }

}

// 실내 문 좌표 목록 및 이동 씬 정의
const HOUSE_DOORS = [
    { x: 20 * TILE_SIZE + 48, y: 20 * TILE_SIZE + 82, type: 'cozy_home' },
    { x: 20 * TILE_SIZE + 48, y: 13 * TILE_SIZE + 82, type: 'cozy_home' },
    { x: 20 * TILE_SIZE + 48, y: 6 * TILE_SIZE + 82, type: 'cozy_home' },
    { x: 34 * TILE_SIZE + 64, y: 25 * TILE_SIZE + 82, type: 'mart_interior' },
    { x: 34 * TILE_SIZE + 48, y: 18 * TILE_SIZE + 82, type: 'cozy_home' },
    { x: 44 * TILE_SIZE + 48, y: 17 * TILE_SIZE + 82, type: 'classroom' }
];

class IndoorScene extends Phaser.Scene {
    constructor() {
        super('IndoorScene');
        this.player = null;
        this.cursors = null;
        this.wasd = null;
        this.npcSprite = null;
        this.indoorType = 'cozy_home';
        this.parentCoords = { x: 30, y: 34 };
    }

    init(data) {
        this.indoorType = data.type || 'cozy_home';
        this.parentCoords = data.parentCoords || { x: 30, y: 34 };
        this.isInteracting = false;
    }

    create() {
        this.cameras.main.setBackgroundColor('#0b0f19');
        this.cameras.main.fadeIn(200);

        const roomSize = 10;
        const startX = 5 * TILE_SIZE;
        const startY = 3 * TILE_SIZE;

        this.staticObstacles = this.physics.add.staticGroup();

        // 바닥 및 외벽 생성
        for (let y = 0; y < roomSize; y++) {
            for (let x = 0; x < roomSize; x++) {
                const px = startX + x * TILE_SIZE + 16;
                const py = startY + y * TILE_SIZE + 16;

                // 바닥 그리기
                const floorColor = this.indoorType === 'classroom' ? 0x1e293b : (this.indoorType === 'mart_interior' ? 0x0f172a : 0x451a03);
                this.add.rectangle(px, py, TILE_SIZE, TILE_SIZE, floorColor);

                // 벽 충돌 지형 생성
                if (x === 0 || x === roomSize - 1 || y === 0 || y === roomSize - 1) {
                    if (y === roomSize - 1 && x === Math.floor(roomSize / 2)) {
                        // 출구 도어 타일 (충돌 제외)
                    } else {
                        const wall = this.add.rectangle(px, py, TILE_SIZE, TILE_SIZE, 0x334155);
                        this.physics.add.existing(wall, true);
                        this.staticObstacles.add(wall);
                    }
                }
            }
        }

        // 출구 시각 표기
        const doorX = startX + Math.floor(roomSize / 2) * TILE_SIZE + 16;
        const doorY = startY + (roomSize - 1) * TILE_SIZE + 16;
        this.add.rectangle(doorX, doorY, TILE_SIZE, 8, 0xef4444);

        this.spawnDecorations(startX, startY);

        // 플레이어 배치
        this.player = this.physics.add.sprite(startX + 5 * TILE_SIZE + 16, startY + 6 * TILE_SIZE + 16, 'player', 'up');
        this.player.body.setCircle(8, 8, 16);
        this.physics.add.collider(this.player, this.staticObstacles, null, () => {
            if (activeBuffs.gravity) return false;
            return true;
        }, this);

        // 키 세팅
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });

        this.input.keyboard.on('keydown-SPACE', () => {
            this.handleInteraction();
        });

        this.input.keyboard.on('keydown-SHIFT', () => {
            triggerDash(this);
        });

        this.spawnIndoorNPC(startX, startY);

        // 대화 프롬프트 텍스트
        this.interactionPrompt = this.add.text(0, 0, 'Space 대화', {
            fontFamily: 'Galmuri9, monospace',
            fontSize: '9px',
            backgroundColor: '#000000bb',
            padding: { x: 6, y: 4 },
            borderRadius: 4
        });
        this.interactionPrompt.setOrigin(0.5, 1);
        this.interactionPrompt.setVisible(false);
        this.interactionPrompt.setDepth(10000);
    }

    spawnDecorations(startX, startY) {
        if (this.indoorType === 'classroom') {
            // 칠판
            const board = this.add.rectangle(startX + 5 * TILE_SIZE + 16, startY + TILE_SIZE + 20, TILE_SIZE * 4, 12, 0x065f46);
            this.physics.add.existing(board, true);
            this.staticObstacles.add(board);
            
            // 책상들
            for (let dx = 2; dx <= 7; dx += 2) {
                const desk = this.add.rectangle(startX + dx * TILE_SIZE + 16, startY + 4 * TILE_SIZE + 16, 20, 16, 0xb45309);
                this.physics.add.existing(desk, true);
                this.staticObstacles.add(desk);
            }
        } else if (this.indoorType === 'mart_interior') {
            // 진열장
            const rack1 = this.add.rectangle(startX + 2 * TILE_SIZE + 16, startY + 4 * TILE_SIZE, 16, 64, 0x78350f);
            this.physics.add.existing(rack1, true);
            this.staticObstacles.add(rack1);
            
            const rack2 = this.add.rectangle(startX + 7 * TILE_SIZE + 16, startY + 4 * TILE_SIZE, 16, 64, 0x78350f);
            this.physics.add.existing(rack2, true);
            this.staticObstacles.add(rack2);
        } else {
            // 침대
            const bed = this.add.rectangle(startX + 2 * TILE_SIZE + 16, startY + 2 * TILE_SIZE + 16, 24, 40, 0xd97706);
            this.physics.add.existing(bed, true);
            this.staticObstacles.add(bed);
            
            // 책상
            const desk = this.add.rectangle(startX + 7 * TILE_SIZE + 16, startY + 2 * TILE_SIZE + 16, 24, 24, 0x78350f);
            this.physics.add.existing(desk, true);
            this.staticObstacles.add(desk);
        }
    }

    spawnIndoorNPC(startX, startY) {
        let name = '이웃 주민';
        let role = '이웃';
        let dialogue = ['아늑한 저희 집이군요! 놀러오신 걸 환영해요.', '마을 구경은 즐거우신가요?'];
        let style = { gender: 'female', skinColor: '#ffd59a', hairColor: '#3e2723', outfitColor: '#9c27b0' };
        
        if (this.indoorType === 'classroom') {
            name = '초등 담임교사';
            role = '교사';
            dialogue = ['학교에 오신 것을 환영해요!', '퀴즈를 풀거나 마을을 크리에이팅하며 골드를 모아보세요.'];
            style = { gender: 'female', skinColor: '#ffdbac', hairColor: '#f57c00', outfitColor: '#00695c' };
        } else if (this.indoorType === 'mart_interior') {
            name = '마트 알바생';
            role = '점원';
            dialogue = ['어서오세요! 필요한 물건이 있다면 패션 상점에서 골드를 내고 구매해보세요.', '러닝 슈즈를 사면 엄청 빨라진답니다!'];
            style = { gender: 'male', skinColor: '#ffdbac', hairColor: '#263238', outfitColor: '#eab308' };
        }
        
        this.npcData = {
            id: 'indoor_npc_' + this.indoorType,
            name: name,
            role: role,
            dialogues: dialogue,
            spriteStyle: style
        };
        
        const npcKey = `npc_${this.npcData.id}`;
        generateCharacterTextureCache(this, npcKey, style);
        
        const px = startX + 5 * TILE_SIZE + 16;
        const py = startY + 2 * TILE_SIZE + 16;
        
        this.npcSprite = this.physics.add.staticSprite(px, py, npcKey, 'down');
    }

    update() {
        if (!currentUser) return;
        
        // IndoorScene 자체 isInteracting 상태 사용 (WorldScene 오참 X)
        if (this.isInteracting) {
            this.player.setVelocity(0);
            return;
        }

        // 대시 중 처리
        if (dashActiveTimer > 0) {
            dashActiveTimer -= this.game.loop.delta;
            this.player.setVelocity(dashDirX * 320, dashDirY * 320);
            this.player.setDepth(this.player.y);
            return;
        }

        // 버프 및 아이템 장착 여부에 따른 이동속도 세팅
        let speed = currentUser.equipped.includes('item_shoes') ? 180 : 120;
        if (currentUser.equipped.includes('item_cat')) speed += 30; // 고양이 꼬리 +30속도
        if (activeBuffs.boost) speed = 260;
        else if (activeBuffs.giant) speed = 200;
        
        this.player.setVelocity(0);

        let dx = 0;
        let dy = 0;

        if (this.cursors.left.isDown || this.wasd.left.isDown) {
            dx = -1;
            this.player.setFrame('left');
        } else if (this.cursors.right.isDown || this.wasd.right.isDown) {
            dx = 1;
            this.player.setFrame('right');
        }

        if (this.cursors.up.isDown || this.wasd.up.isDown) {
            dy = -1;
            this.player.setFrame('up');
        } else if (this.cursors.down.isDown || this.wasd.down.isDown) {
            dy = 1;
            this.player.setFrame('down');
        }

        if (dx !== 0 && dy !== 0) {
            dx *= 0.7071;
            dy *= 0.7071;
        }

        this.player.setVelocity(dx * speed, dy * speed);
        
        // 크기 및 아우라 버프 적용
        applyPhaserBuffVisuals(Object.keys(activeBuffs).find(k => activeBuffs[k] === true && k !== 'timer'));
        if (currentUser.equipped.includes('item_aura_spark') && this.time.now % 10 < 3) {
            this.spawnElectricSpark(this.player.x, this.player.y);
        }
        if (currentUser.equipped.includes('item_aura_fire') && this.time.now % 10 < 3) {
            this.spawnFireSpark(this.player.x, this.player.y);
        }
        if (currentUser.equipped.includes('item_aura_ice') && this.time.now % 10 < 3) {
            this.spawnIceSpark(this.player.x, this.player.y);
        }

        // IndoorScene 퇴장 문 감지
        const roomSize = 10;
        const startX = 5 * TILE_SIZE;
        const startY = 3 * TILE_SIZE;
        const doorX = startX + Math.floor(roomSize / 2) * TILE_SIZE + 16;
        const doorY = startY + (roomSize - 1) * TILE_SIZE + 16;
        
        const distToDoor = Phaser.Math.Distance.Between(this.player.x, this.player.y, doorX, doorY + 24);
        if (distToDoor < 28 && !this.isInteracting) {
            this.isInteracting = true;
            this.cameras.main.fadeOut(200);
            this.time.delayedCall(200, () => {
                this.scene.stop('IndoorScene');
                this.scene.start('WorldScene', {
                    x: this.parentCoords.x * TILE_SIZE + 16,
                    y: this.parentCoords.y * TILE_SIZE + 48
                });
            });
        }

        // NPC 대화 프롬프트
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.npcSprite.x, this.npcSprite.y);
        if (dist < 45) {
            this.interactionPrompt.setPosition(this.npcSprite.x, this.npcSprite.y - 20);
            this.interactionPrompt.setVisible(true);
        } else {
            this.interactionPrompt.setVisible(false);
        }
    }

    handleInteraction() {
        const dialogueBox = document.getElementById('dialogue-box');
        if (!dialogueBox.classList.contains('hidden')) {
            progressDialogue();
            return;
        }
        
        const dist = this.npcSprite ? Phaser.Math.Distance.Between(
            this.player.x, this.player.y, this.npcSprite.x, this.npcSprite.y
        ) : 999;
        
        if (dist < 60 && this.npcData) {
            this.isInteracting = true;
            startDialogue(this.npcData);
        }
    }

    spawnElectricSpark(px, py) {
        const angle = (this.time.now / 150) % (Math.PI * 2);
        const radius = 24 * (activeBuffs.giant ? 2.2 : (activeBuffs.mini ? 0.5 : 1));
        const sx = px + Math.cos(angle) * radius;
        const sy = py + Math.sin(angle) * radius;
        
        const spark = this.add.text(sx, sy, '⚡', {
            fontFamily: 'monospace',
            fontSize: activeBuffs.giant ? '14px' : '9px',
            color: '#ffd54f'
        });
        spark.setOrigin(0.5, 0.5);
        spark.setDepth(py + 10);
        
        this.tweens.add({
            targets: spark,
            scale: 1.5,
            alpha: 0,
            duration: 300,
            onComplete: () => spark.destroy()
        });
    }

    spawnFireSpark(px, py) {
        const angle = (this.time.now / 120) % (Math.PI * 2);
        const radius = 24 * (activeBuffs.giant ? 2.2 : (activeBuffs.mini ? 0.5 : 1));
        const sx = px + Math.cos(angle) * radius;
        const sy = py + Math.sin(angle) * radius;
        
        const spark = this.add.text(sx, sy, '🔥', {
            fontFamily: 'monospace',
            fontSize: activeBuffs.giant ? '14px' : '9px',
            color: '#f97316'
        });
        spark.setOrigin(0.5, 0.5);
        spark.setDepth(py + 10);
        
        this.tweens.add({
            targets: spark,
            scale: 1.6,
            alpha: 0,
            duration: 350,
            onComplete: () => spark.destroy()
        });
    }

    spawnIceSpark(px, py) {
        const angle = -(this.time.now / 180) % (Math.PI * 2);
        const radius = 24 * (activeBuffs.giant ? 2.2 : (activeBuffs.mini ? 0.5 : 1));
        const sx = px + Math.cos(angle) * radius;
        const sy = py + Math.sin(angle) * radius;
        
        const spark = this.add.text(sx, sy, '❄️', {
            fontFamily: 'monospace',
            fontSize: activeBuffs.giant ? '12px' : '8px',
            color: '#38bdf8'
        });
        spark.setOrigin(0.5, 0.5);
        spark.setDepth(py + 10);
        
        this.tweens.add({
            targets: spark,
            scale: 1.4,
            alpha: 0,
            duration: 400,
            onComplete: () => spark.destroy()
        });
    }
}

class FantasyForestScene extends Phaser.Scene {
    constructor() {
        super('FantasyForestScene');
        this.player = null;
        this.cursors = null;
        this.wasd = null;
        this.starsGroup = null;
    }

    preload() {
        // 빛나는 마법 별 Canvas 생성
        if (!this.textures.exists('obj-star')) {
            const star = this.textures.createCanvas('obj-star', 16, 16);
            const sCtx = star.context;
            sCtx.fillStyle = '#ec4899'; // Magical pink star
            sCtx.beginPath();
            sCtx.arc(8, 8, 6, 0, Math.PI * 2);
            sCtx.fill();
            sCtx.fillStyle = '#22d3ee'; // Cyan highlight
            sCtx.fillRect(6, 6, 4, 4);
            star.refresh();
        }
    }

    create() {
        this.cameras.main.setBackgroundColor('#090514'); // 신비한 보랏빛 심연
        this.cameras.main.fadeIn(200);

        const magicalMapSize = 40;
        this.staticObstacles = this.physics.add.staticGroup();

        // 맵 배경 격자 생성
        for (let y = 0; y < magicalMapSize; y++) {
            for (let x = 0; x < magicalMapSize; x++) {
                const px = x * TILE_SIZE + 16;
                const py = y * TILE_SIZE + 16;
                
                const isBorder = (x === 0 || x === magicalMapSize - 1 || y === 0 || y === magicalMapSize - 1);
                const tileColor = isBorder ? 0x2e1065 : (Math.random() < 0.08 ? 0x1e1b4b : 0x0f172a);
                
                const rect = this.add.rectangle(px, py, TILE_SIZE, TILE_SIZE, tileColor);
                
                if (isBorder) {
                    this.physics.add.existing(rect, true);
                    this.staticObstacles.add(rect);
                }
            }
        }

        // 장애물: 빛나는 크리스탈 버섯 스폰
        for (let i = 0; i < 40; i++) {
            const rx = Phaser.Math.Between(2, magicalMapSize - 3);
            const ry = Phaser.Math.Between(2, magicalMapSize - 3);
            
            const px = rx * TILE_SIZE + 16;
            const py = ry * TILE_SIZE + 16;
            
            const mushroom = this.add.circle(px, py, 12, 0xd946ef); // magenta
            this.add.circle(px, py, 6, 0x22d3ee); // cyan
            this.physics.add.existing(mushroom, true);
            this.staticObstacles.add(mushroom);
        }

        // 플레이어 생성
        this.player = this.physics.add.sprite(20 * TILE_SIZE + 16, 20 * TILE_SIZE + 16, 'player', 'down');
        this.player.body.setCircle(8, 8, 16);
        this.physics.add.collider(this.player, this.staticObstacles, null, () => {
            if (activeBuffs.gravity) return false;
            return true;
        }, this);

        // 카메라 바운드 및 추적
        this.cameras.main.setBounds(0, 0, magicalMapSize * TILE_SIZE, magicalMapSize * TILE_SIZE);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.setZoom(1.5);

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });

        this.input.keyboard.on('keydown-SHIFT', () => {
            triggerDash(this);
        });

        // 타운 복귀용 리턴 포탈
        const returnX = 20 * TILE_SIZE + 16;
        const returnY = 5 * TILE_SIZE + 16;
        this.returnPortal = this.add.circle(returnX, returnY, 20, 0x06b6d4);
        this.returnPortal.setStrokeStyle(2, 0xffffff);
        this.physics.add.existing(this.returnPortal, true);

        this.tweens.add({
            targets: this.returnPortal,
            scale: 1.25,
            alpha: 0.6,
            duration: 800,
            yoyo: true,
            loop: -1
        });

        // 마법 별 스폰 그룹
        this.starsGroup = this.physics.add.group();
        this.physics.add.overlap(this.player, this.starsGroup, this.collectStar, null, this);

        for (let i = 0; i < 12; i++) {
            this.spawnMagicalStar();
        }

        // 6초 주기 별 생성 루프
        this.time.addEvent({
            delay: 6000,
            callback: this.spawnMagicalStar,
            callbackScope: this,
            loop: true
        });

        // 숲 전용 선물 상자 스폰 물리 그룹 설정
        this.boxesGroup = this.physics.add.group();
        this.physics.add.overlap(this.player, this.boxesGroup, this.collectBox, null, this);
        this.time.addEvent({
            delay: 18000,
            callback: this.spawnForestBox,
            callbackScope: this,
            loop: true
        });
        for (let i = 0; i < 3; i++) this.spawnForestBox();
    }

    spawnForestBox() {
        if (this.boxesGroup.getChildren().length >= 6) return;
        let rx = Phaser.Math.Between(3, 36);
        let ry = Phaser.Math.Between(3, 36);
        const px = rx * TILE_SIZE + 16;
        const py = ry * TILE_SIZE + 16;
        const box = this.physics.add.sprite(px, py, 'obj-box');
        box.setDepth(py);
        this.boxesGroup.add(box);
        this.tweens.add({
            targets: box,
            y: py - 4,
            duration: 600,
            yoyo: true,
            loop: -1,
            ease: 'Sine.easeInOut'
        });
    }

    collectBox(player, box) {
        const worldScene = gameInstance.scene.getScene('WorldScene');
        worldScene.collectBox(player, box);
    }

    spawnMagicalStar() {
        if (this.starsGroup.getChildren().length >= 25) return;
        let cx = Phaser.Math.Between(2, 37);
        let cy = Phaser.Math.Between(2, 37);
        const px = cx * TILE_SIZE + 16;
        const py = cy * TILE_SIZE + 16;
        
        const star = this.physics.add.sprite(px, py, 'obj-star');
        star.setDepth(py);
        this.starsGroup.add(star);
        
        this.tweens.add({
            targets: star,
            y: py - 6,
            duration: 600,
            yoyo: true,
            loop: -1,
            ease: 'Sine.easeInOut'
        });
    }

    collectStar(player, star) {
        star.destroy();
        playSynthDing();

        let amount = 20; // 숲 마법의 별은 20G 지급!
        if (currentUser && currentUser.equipped.includes('item_scarf')) {
            amount = 35; // 빨간 목도리 장착 시 35G!
        }
        if (activeBuffs.shield) amount *= 2; // 골드 2배 버프 적용
        if (currentUser && currentUser.equipped.includes('item_lucky_coin')) {
            amount = Math.floor(amount * 1.5); // 행운의 동전 +50%
        }
        if (activeBuffs.lucky) amount = Math.floor(amount * 2.5); // 초행운 버프

        if (currentUser) {
            currentUser.gold += amount;
            syncCurrentUser();
        }

        const floatText = this.add.text(player.x, player.y - 10, `+${amount}G`, {
            fontFamily: 'Galmuri9, monospace',
            fontSize: '11px',
            color: '#ec4899',
            stroke: '#000000',
            strokeThickness: 2
        });
        floatText.setOrigin(0.5, 0.5);

        this.tweens.add({
            targets: floatText,
            y: player.y - 40,
            alpha: 0,
            duration: 800,
            onComplete: () => floatText.destroy()
        });
    }

    update() {
        if (!currentUser) return;

        const worldScene = gameInstance.scene.getScene('WorldScene');
        if (worldScene.isInteracting) {
            this.player.setVelocity(0);
            return;
        }

        // 대시 중 처리
        if (dashActiveTimer > 0) {
            dashActiveTimer -= this.game.loop.delta;
            this.player.setVelocity(dashDirX * 320, dashDirY * 320);
            if (this.time.now % 2 === 0) {
                worldScene.spawnTrailParticle(this.player.x, this.player.y + 12);
            }
            this.player.setDepth(this.player.y);
            return;
        }

        // 버프 및 아이템 장착 여부에 따른 이동속도 세팅
        let speed = currentUser.equipped.includes('item_shoes') ? 180 : 120;
        if (currentUser.equipped.includes('item_cat')) speed += 30; // 고양이 꼬리 +30속도
        if (activeBuffs.boost) speed = 260;
        else if (activeBuffs.giant) speed = 200;

        this.player.setVelocity(0);
        let dx = 0;
        let dy = 0;

        if (this.cursors.left.isDown || this.wasd.left.isDown) {
            dx = -1;
            this.player.setFrame('left');
        } else if (this.cursors.right.isDown || this.wasd.right.isDown) {
            dx = 1;
            this.player.setFrame('right');
        }

        if (this.cursors.up.isDown || this.wasd.up.isDown) {
            dy = -1;
            this.player.setFrame('up');
        } else if (this.cursors.down.isDown || this.wasd.down.isDown) {
            dy = 1;
            this.player.setFrame('down');
        }

        if (dx !== 0 && dy !== 0) {
            dx *= 0.7071;
            dy *= 0.7071;
        }

        this.player.setVelocity(dx * speed, dy * speed);
        this.player.setDepth(this.player.y);

        applyPhaserBuffVisuals(Object.keys(activeBuffs).find(k => activeBuffs[k] === true && k !== 'timer'));

        // 입자 효과 방출
        if (this.player.body.speed > 0 && currentUser.equipped.includes('item_trail_rainbow')) {
            worldScene.spawnTrailParticle(this.player.x, this.player.y + 12);
        }
        if (this.player.body.speed > 0 && currentUser.equipped.includes('item_trail_snow')) {
            worldScene.spawnSnowTrailParticle(this.player.x, this.player.y + 12);
        }
        if (currentUser.equipped.includes('item_aura_spark') && this.time.now % 10 < 3) {
            worldScene.spawnElectricSpark(this.player.x, this.player.y);
        }
        if (currentUser.equipped.includes('item_aura_fire') && this.time.now % 10 < 3) {
            worldScene.spawnFireSpark(this.player.x, this.player.y);
        }
        if (currentUser.equipped.includes('item_aura_ice') && this.time.now % 10 < 3) {
            worldScene.spawnIceSpark(this.player.x, this.player.y);
        }

        // 자석 효과 (자석 버프 활성화 시 별 끌어오기)
        if (activeBuffs.magnet) {
            this.starsGroup.getChildren().forEach(star => {
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, star.x, star.y);
                if (dist < 180) {
                    const angle = Phaser.Math.Angle.Between(star.x, star.y, this.player.x, this.player.y);
                    star.body.setVelocity(Math.cos(angle) * 200, Math.sin(angle) * 200);
                } else {
                    star.body.setVelocity(0);
                }
            });
        }

        // 복귀 포탈 이동 감지
        const distPortal = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.returnPortal.x, this.returnPortal.y);
        if (distPortal < 25 && !worldScene.isInteracting) {
            worldScene.isInteracting = true;
            this.cameras.main.fadeOut(200);
            this.time.delayedCall(200, () => {
                this.scene.stop('FantasyForestScene');
                this.scene.start('WorldScene', {
                    x: 47 * TILE_SIZE + 16,
                    y: 15 * TILE_SIZE + 16
                });
            });
        }
    }
}


// ==========================================================================
// 14. 메인 부트스트래퍼 초기화
// ==========================================================================

let gameInstance = null;

// Phaser 게임 엔진 초기화 (서버 접속 성공 후 호출)
function startGameEngine() {
    if (gameInstance) {
        // 이미 인스턴스 있으면 WorldScene 재시작
        try {
            gameInstance.scene.stop('IndoorScene');
            gameInstance.scene.stop('FantasyForestScene');
            gameInstance.scene.start('WorldScene');
        } catch(e) {
            console.warn('Scene restart failed, recreating:', e);
        }
        return;
    }

    const config = {
        type: Phaser.AUTO,
        parent: 'game-canvas-container',
        width: 640,
        height: 480,
        physics: {
            default: 'arcade',
            arcade: {
                gravity: { y: 0 },
                debug: false
            }
        },
        scene: [WorldScene, IndoorScene, FantasyForestScene],
        pixelArt: true,
        antialias: false,
        backgroundColor: '#1a1a2e',
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH
        }
    };

    gameInstance = new Phaser.Game(config);
}

window.addEventListener('DOMContentLoaded', () => {
    // 1. 로컬 데이터베이스 셋업
    initLocalStorage();
    
    // 2. 맵 타일 셋업
    initMapGrid();
    
    // 3. UI 서브시스템 바인딩 (Phaser는 서버 접속 후 시작)
    updateSidebarNPCList();
    setupCreatorForm();
    setupMinimapClick();
    initMobileControls();
    
    setupLoginSystem();
    setupShopAndInventory();
    setupQuizManager();
    setupAdminPanel();
    setupAdminQuizForm();

    // ESC 대화창 닫기 단축키
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDialogue();
        }
    });
});
