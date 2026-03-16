import express from "express";
import cors from "cors";
import axios from "axios";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";

const app = express();

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

app.post("/analyze", async (req, res) => {
  const { url } = req.body;
  
  try {
    const { data } = await axios.get(url);
    
    const dom = new JSDOM(data, { url });

    const reader = new Readability(dom.window.document);

    const article = reader.parse();
    const mainImage = await extractMainImage(data);

    const summaryObj = await summarizeText(article.textContent);
    res.json({
      mainImage,
      summary: summaryObj.summary,
      implications: summaryObj.implications,
      title: article.title,
      // impact_category: summaryObj.impact_category
    });

  } catch (error) {
    res.status(500).json({ error: "Failed to fetch article" });
  }
});

const API_KEY = "";
const MODEL = "gemini-2.5-flash"; // Stable 2026 workhorse model
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function summarizeText(articleText) {
  const requestBody = {
    contents: [{
      parts: [{
        // We inject your extracted text here
        text: `The following is a news article. Please summarize it and provide 3-4 potential real-world implications and generate an image that fits the content.
        
        ARTICLE TEXT:
        ${articleText}
        
        Return the result strictly as a JSON object.`
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          summary: { 
            type: "string", 
            description: "A concise 3-sentence summary of the news." 
          },
          implications: { 
            type: "array", 
            items: { type: "string" },
            description: "A list of potential future consequences or impacts."
          },
          impact_category: {
            type: "string",
            enum: ["Economic", "Political", "Social", "Technological", "Environmental"]
          }
        },
        required: ["summary", "implications", "impact_category"]
      }
    }
  };

  try {
    const response = await axios.post(`${BASE_URL}?key=${API_KEY}`, requestBody);
    
    // Parse the JSON string returned by Gemini
    const result = JSON.parse(response.data.candidates[0].content.parts[0].text);
    
    console.log("Summary:", result.summary);
    console.log("Implications:", result.implications);
    return result;
  } catch (error) {
    console.error("Error analyzing text:", error.response?.data || error.message);
  }
}

async function extractMainImage(data) {
  const $ = cheerio.load(data);

  // 1️⃣ Open Graph image
  let image =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content");

  // 2️⃣ Image inside article
  if (!image) {
    image = $("article img").first().attr("src");
  }

  // 3️⃣ Figure image
  if (!image) {
    image = $("figure img").first().attr("src");
  }

  // 4️⃣ Largest reasonable image fallback
  if (!image) {
    const imgs = $("img")
      .map((i, el) => ({
        src: $(el).attr("src"),
        width: parseInt($(el).attr("width")) || 0,
        height: parseInt($(el).attr("height")) || 0
      }))
      .get()
      .filter(img => img.width > 200 && img.height > 200);

    if (imgs.length > 0) {
      imgs.sort((a, b) => (b.width * b.height) - (a.width * a.height));
      image = imgs[0].src;
    }
  }
  console.log("Extracted image:", image);
  return image;
}
app.listen(3000, () => {
  console.log("Server running on port 3000");
});

