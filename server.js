require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
    'http://127.0.0.1:5500', 
    'http://localhost:3000', 
    'https://alltoy24.github.io' // ★ yoonho-github 대신 실제 주소인 alltoy24로 변경!
];
app.use(cors({
    origin: function(origin, callback) {
        // 로컬 테스트(origin 없음)나 리스트에 있는 주소면 통과
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            // 에러 메시지에 현재 요청을 보낸 실제 origin을 찍어서 확인하기 좋게 수정
            console.log("❌ 차단된 요청 Origin:", origin); 
            callback(new Error('CORS 정책에 의해 차단되었습니다.'));
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

let cachedQuote = {
    date: "",
    texts: ["오늘도 당신의 정원에 평안이 깃들기를."] 
};

// 🌿 5개의 감성 덕담 일괄 생성기
async function getDailyQuotes() {
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const dayOfWeek = days[now.getDay()];
    
    const todayStr = `${year}-${month}-${date}`;

    // 이미 오늘자 덕담 5개를 만들었다면 통과
    if (cachedQuote.date === todayStr && cachedQuote.texts.length > 1) {
        return;
    }

    let specialEvent = "";
    if (month === 1 && date === 1) specialEvent = "새해 첫날";
    else if (month === 2 && date === 17) specialEvent = "설날"; 
    else if (month === 9 && date === 25) specialEvent = "추석"; 
    else if (month === 12 && date === 25) specialEvent = "크리스마스";
    else if (month === 12 && date === 31) specialEvent = "한 해의 마지막 날";

    let contextMessage = `오늘은 ${year}년 ${month}월 ${date}일, ${dayOfWeek}요일입니다. `;
    if (specialEvent) {
        contextMessage += `오늘은 특별한 날인 '${specialEvent}'입니다. 이 날이 주는 고유한 분위기를 담아주세요.`;
    } else {
        contextMessage += `${dayOfWeek}요일이 주는 감성을 담아주세요.`;
    }

    const systemPrompt = `
        당신은 몽환적이고 신비로운 '글숲'의 정원사입니다.
        방문객의 마음에 위로와 평온을 주는 시적이고 우아한 덕담을 작성해야 합니다.
        
        [상황]
        ${contextMessage}
        
        [절대 지켜야 할 규칙]
        1. 너무 노골적으로 날짜나 요일을 언급하지 마세요.
        2. 은유적이고 자연스럽게 분위기만 녹여내세요.
        3. 이모지는 쓰지 마세요.
        
        [출력 형식 - 중요!]
        위 규칙을 지키는 '서로 다른 내용의 덕담 5개'를 작성해주세요.
        반드시 각 문장은 줄바꿈(엔터)으로만 구분해야 하며, 문장 앞에 번호(1. 2. 등)나 기호(-, *)를 절대 붙이지 마세요.
    `;

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "system", content: systemPrompt }],
                temperature: 0.8
            })
        });

        const data = await response.json();
        const content = data.choices[0].message.content.trim();
        
        // AI가 준 텍스트를 줄바꿈 기준으로 잘라서 배열로 만듦
        let quotesArray = content.split('\n').map(q => q.trim()).filter(q => q.length > 0);
        
        // 혹시 AI가 말 안 듣고 앞에 "1. " 같은 걸 붙였을까봐 정규식으로 청소
        quotesArray = quotesArray.map(q => q.replace(/^[\d\-\.\*\s]+/, ''));
        
        if (quotesArray.length > 0) {
            cachedQuote.texts = quotesArray;
            cachedQuote.date = todayStr;
        }

    } catch (error) {
        console.error("덕담 생성 실패:", error);
    }
}

// 🌿 프론트에서 호출할 API 엔드포인트
app.get('/api/daily-quote', async (req, res) => {
    // 혹시 캐시가 비어있거나 날이 바뀌었으면 업데이트 수행
    await getDailyQuotes(); 
    
    // 5개의 명언 중 랜덤으로 1개를 뽑음
    const quotes = cachedQuote.texts;
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    
    res.json({ quote: randomQuote });
});

// 월간 회고는 AI 토큰을 많이 먹으므로 하루 5번으로 더 빡빡하게 제한!
const summaryLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24시간
    max: 5, 
    message: { error: '월간 회고 요청 한도를 초과했습니다. 내일 다시 시도해주세요.' }
});

app.get('/', (req, res) => {
    res.send('🌿 글숲 정원 관리 서버 가동 중 (Updated for Dates)');
});

app.post('/analyze', analyzeLimiter, async (req, res) => {
    const { diaryText } = req.body;

    if (!diaryText) {
        return res.status(400).json({ error: '일기 내용이 비어있습니다.' });
    }

    console.log("📨 정원사가 편지를 받았습니다. 분석 시작...");

    try {
        const systemPrompt = `
            You are the "Master Gardener of Souls," a wise and philosophical AI guide who nurtures a virtual garden based on human emotions and reflections. 
            Analyze the user's diary entry and transform it into growth data for their garden.

            [Scoring Rules]
            1. Virtues: courage, wisdom, kindness, diligence, serenity.
            2. Total Points: Exactly 10 integers.
            3. Distribution Logic: 
            - Do NOT distribute points evenly. 
            - Assign 7 to 9 points to the 1 or 2 virtues most relevant to the text.
            - Assign 0 points to irrelevant virtues.
        
            [Commentary Guidelines]
            1. Length: Provide a deep, insightful response (approx. 100-200 Korean characters).
            2. Tone: Intellectual, empathetic, and poetic. Offer a psychological reflection.
            3. Language: The "comment" field MUST be in Korean.

            [Output Format]
            Strictly JSON:
            {
                "points": {"courage": 0, "wisdom": 0, "kindness": 0, "diligence": 0, "serenity": 0},
                "comment": "Poetic Korean response"
            }
        `;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: diaryText }
                ],
                response_format: { type: "json_object" },
                temperature: 0.8
            })
        });

        const data = await response.json();
        
        if (data.error) throw new Error(data.error.message);

        const result = JSON.parse(data.choices[0].message.content);
        res.json(result);

    } catch (error) {
        console.error("❌ 서버 에러:", error);
        res.status(500).json({ error: "정원사가 잠시 자리를 비웠습니다." });
    }
});

// [적용] 여기도 'summaryLimiter' 장착!
app.post('/monthly-summary', summaryLimiter, async (req, res) => {
    const { diaries } = req.body; 

    if (!diaries || diaries.length === 0) {
        return res.status(400).json({ error: '분석할 일기가 없습니다.' });
    }

    console.log(`📅 월간 회고 요청: 총 ${diaries.length}개의 일기 분석 중...`);

    try {
        let monthlyTotal = { courage: 0, wisdom: 0, kindness: 0, diligence: 0, serenity: 0 };
        
        diaries.forEach(d => {
            if (d.stat_increase) {
                for (const [key, val] of Object.entries(d.stat_increase)) {
                    if (monthlyTotal[key] !== undefined) {
                        monthlyTotal[key] += val;
                    }
                }
            }
        });

        const formattedDiaries = diaries.map(d => {
            const dateLabel = d.date_str || "Unknown Date"; 
            return `[Date: ${dateLabel}] ${d.content}`;
        }).join("\n\n"); 

        const systemPrompt = `
            You are the "Master Gardener of the Soul."
            The user provides diary entries from the past month.
            
            [Task 1: Summary Messages (Gardener's Voice)]
            - Create **2 short messages** for EACH virtue category.
            - **CRITICAL:** Do NOT simply copy/quote the diary. **REWRITE** the event as if you are a warm, observant gardener speaking to the user.
            - **Language:** Korean (Polite & Poetic 'Haeyo-che').
            
            [STYLE EXAMPLES - FOLLOW THIS!]
            - Input: "I studied hard and finished the project."
            - Bad (Quote): "프로젝트를 끝냈다."
            - Good (Gardener): "치열했던 노력 끝에 마침내 결실을 맺으셨군요."
            
            - Input: "I helped my friend."
            - Good (Gardener): "친구에게 건넨 따뜻한 손길이 정원에도 온기를 더했습니다."

            [LOGIC RULES]
            1. **Diversity:** Do NOT select two messages from the SAME diary entry. Pick different dates.
            2. **Flow:** Place the earlier date first.
            3. **Extraction:** You MUST allow the JSON to carry the exact [Date] of the original entry.

            [Task 2: Persona Summary]
            - Define "Who the user was this month" in **3 distinct lines** (Korean).
            - Line 1: Metaphor (e.g., "거친 파도를 헤쳐나온 항해사")
            - Line 2: Emotional Achievement
            - Line 3: Closing Encouragement

            [Output Format - Strictly JSON]
            {
                "quotes": {
                    "courage": [ { "text": "Gardener's Message 1", "date": "YYYY-MM-DD" }, ... ],
                    "wisdom": [ ... ],
                    "kindness": [ ... ],
                    "diligence": [ ... ],
                    "serenity": [ ... ]
                },
                "persona_3_lines": [ "Line 1", "Line 2", "Line 3" ]
            }
        `;

        const contentToSend = formattedDiaries.substring(0, 30000); 

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini", 
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Here are my diaries:\n${contentToSend}` }
                ],
                response_format: { type: "json_object" },
                temperature: 0.7 
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const aiResult = JSON.parse(data.choices[0].message.content);
        
        const finalResponse = {
            quotes: aiResult.quotes, 
            persona: aiResult.persona_3_lines,
            stats: monthlyTotal
        };
        
        console.log("✅ 월간 회고 생성 완료 (정원사 말투 적용됨)");
        res.json(finalResponse);

    } catch (error) {
        console.error("❌ 월간 분석 에러:", error);
        res.status(500).json({ error: "회고 분석 실패" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});