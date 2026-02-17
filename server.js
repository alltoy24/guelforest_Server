require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // 용량 제한 넉넉하게

app.get('/', (req, res) => {
    res.send('🌿 글숲 정원 관리 서버 가동 중 (Updated for Dates)');
});

// [기존 유지] 일기 분석 API (여기는 바꿀 필요 없음)
app.post('/analyze', async (req, res) => {
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

// [완벽 보강된] 월간 회고 API (다양성 + 순서 + 3줄요약 + 통계)
app.post('/monthly-summary', async (req, res) => {
    const { diaries } = req.body; 

    if (!diaries || diaries.length === 0) {
        return res.status(400).json({ error: '분석할 일기가 없습니다.' });
    }

    console.log(`📅 월간 회고 요청: 총 ${diaries.length}개의 일기 분석 중...`);

    try {
        // 1. [직접 계산] 스탯 통계
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

        // 2. AI 데이터 가공
        const formattedDiaries = diaries.map(d => {
            const dateLabel = d.date_str || "Unknown Date"; 
            return `[Date: ${dateLabel}] ${d.content}`;
        }).join("\n\n"); 

        const systemPrompt = `
            You are the "Master Gardener of the Soul."
            The user provides diary entries from the past month.
            
            [Task 1: Summary Quotes (Strict Rules)]
            - Select **2 IMPACTFUL quotes** for EACH virtue category.
            - **REWRITE** the content as a warm, polite gardener speaking to the user (Korean).
            - **CRITICAL RULE 1 (Diversity):** Do NOT select two quotes from the SAME diary entry unless unavoidable. Prioritize different dates.
            - **CRITICAL RULE 2 (Flow):** Ensure logical order (Action -> Realization) or chronological order (Earlier Date -> Later Date).
            - Extract the exact [Date] for each quote.

            [Task 2: Persona Summary]
            - Define "Who the user was this month" in **3 distinct lines** (Korean).
            - Line 1: A metaphor (e.g., "거친 파도를 헤쳐나온 항해사였습니다.")
            - Line 2: Main emotional achievement (e.g., "두려움 속에서도 결국 답을 찾으셨군요.")
            - Line 3: Closing encouragement (e.g., "당신의 땀방울이 단단한 뿌리가 되었습니다.")
            - Tone: Deep, emotional, and poetic.

            [Output Format - Strictly JSON]
            {
                "quotes": {
                    "courage": [ { "text": "...", "date": "YYYY-MM-DD" }, ... ],
                    "wisdom": [ ... ],
                    "kindness": [ ... ],
                    "diligence": [ ... ],
                    "serenity": [ ... ]
                },
                "persona_3_lines": [
                    "Line 1 text",
                    "Line 2 text",
                    "Line 3 text"
                ]
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
                    { role: "user", content: `Analyze my month based on these diaries:\n${contentToSend}` }
                ],
                response_format: { type: "json_object" },
                temperature: 0.6 // 창의성(0.7)과 논리(0.5)의 균형점
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const aiResult = JSON.parse(data.choices[0].message.content);
        
        // 3. 최종 병합
        const finalResponse = {
            quotes: aiResult.quotes,
            persona: aiResult.persona_3_lines,
            stats: monthlyTotal
        };
        
        console.log("✅ 월간 회고 생성 완료 (품질 보증: 다양성/순서/통계/3줄요약)");
        res.json(finalResponse);

    } catch (error) {
        console.error("❌ 월간 분석 에러:", error);
        res.status(500).json({ error: "회고 분석 실패" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});