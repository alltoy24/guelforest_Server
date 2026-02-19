require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
    'http://127.0.0.1:5500', 
    'http://localhost:3000', 
    'https://yoonho-github.github.io' // ★여기에 나중에 배포할 글숲 주소 입력!
];

app.use(cors({
    origin: function(origin, callback) {
        // 출처가 없거나(서버 자체 요청), 허락된 리스트에 있으면 통과!
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            // 허락되지 않은 이상한 사이트에서 오면 차단!
            callback(new Error('허용되지 않은 접근입니다. (CORS Blocked)'));
        }
    }
}));

app.use(express.json({ limit: '10mb' }));

const analyzeLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24시간
    max: 10, 
    message: { error: '오늘 정원사가 너무 많은 편지를 받았습니다. 내일 다시 찾아와주세요.' }
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
            1. Length: Provide a deep, insightful response (approx. 300-400 Korean characters).
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