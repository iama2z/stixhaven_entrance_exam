const {onCall} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {GoogleGenerativeAI} = require("@google/generative-ai");

initializeApp();

exports.strixhavenConsultant = onCall(
    {secrets: ["GEMINI_API_KEY"]},
    async (request) => {
      const {playerPrompt, jsonCategory} = request.data;

      const data = require(`./data/${jsonCategory}.json`);

      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({model: "gemini-1.5-flash"});

      const prompt = "You are a Strixhaven University Admissions Officer. " +
        "Use this data as your source of truth: " +
        JSON.stringify(data) + " Student question: " + playerPrompt;

      const result = await model.generateContent(prompt);
      return {response: result.response.text()};
    },
);
