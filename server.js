require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // 일기 데이터가 많을 수 있으니 용량 제한 늘림

app.get('/', (req, res) => {
    res.send('🌿 글숲 정원 관리 서버 가동 중 (Render)');
});

// [기존] 일기 분석 API
app.post('/analyze', async (req, res) => {
    const { diaryText } = req.body;

    if (!diaryText) {
        return res.status(400).json({ error: '일기 내용이 비어있습니다.' });
    }

    console.log("📨 정원사가 편지를 받았습니다. 분석 시작...");

    try {
        // [여기가 핵심] 프론트엔드에 있던 프롬프트를 서버로 가져옴
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

app.post('/monthly-summary', async (req, res) => {
    const { diaries } = req.body; // 프론트에서 보낸 일기 배열

    if (!diaries || diaries.length === 0) {
        return res.status(400).json({ error: '분석할 일기가 없습니다.' });
    }

    console.log(`📅 월간 회고 요청: 총 ${diaries.length}개의 일기 분석 중...`);

    try {
        const systemPrompt = `
            You are the "Chronicler of the Soul." 
            The user provides a list of diary entries from the past month.
            Your task is to select the **most impactful, poetic, or meaningful 2 sentences** for EACH virtue category (Courage, Wisdom, Kindness, Diligence, Serenity).
            
            [Input Format]
            Array of strings (diaries).

            [Selection Logic]
            - Look for sentences that best represent each virtue.
            - If there are no specific diaries for a virtue, pick general inspiring sentences from the text.
            - The selected sentences must be in **Korean**.
            - Make them sound like a "Typographic Quote". Short, punchy, and emotional.

            [Output Format - JSON Only]
            {
                "courage": ["Quote 1", "Quote 2"],
                "wisdom": ["Quote 1", "Quote 2"],
                "kindness": ["Quote 1", "Quote 2"],
                "diligence": ["Quote 1", "Quote 2"],
                "serenity": ["Quote 1", "Quote 2"]
            }
        `;

        // 일기 내용만 합쳐서 보냄 (너무 길면 자름)
        const combinedDiaries = diaries.map(d => d.content).join("\n\n").substring(0, 15000);

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
                    { role: "user", content: `Here are my diaries:\n${combinedDiaries}` }
                ],
                response_format: { type: "json_object" },
                temperature: 0.7
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const result = JSON.parse(data.choices[0].message.content);
        res.json(result);

    } catch (error) {
        console.error("❌ 월간 분석 에러:", error);
        res.status(500).json({ error: "회고 분석 실패" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});