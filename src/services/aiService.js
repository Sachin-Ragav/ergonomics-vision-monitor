
const API_URL = 'http://127.0.0.1:8888/v1/chat/completions';

// Keep your Unsloth API token private.
// Do not upload this token to GitHub or share it publicly.
const API_TOKEN = 'your api token here';

const MODEL_NAME = 'unsloth/Qwen3-VL-4B-Instruct-GGUF';

const PROMPT_TEXT = `Analyze the person visible in this image for a computer ergonomics monitoring application.

Return ONLY valid JSON:

{
  "person_visible": true,
  "sitting": true,
  "slouching": false,
  "head_position": "neutral",
  "eyes": "open",
  "description": "short description"
}

Rules:

- person_visible must be false if no person is visible.
- sitting must be true only if the person appears to be sitting.
- slouching should be based only on visible posture.
- head_position must be one of: "neutral", "forward", "down", "unknown".
- eyes must be one of: "open", "closed", "unknown".
- Do not diagnose medical conditions.
- Return JSON only.`;

export async function analyzeImage(imageData) {
  const payload = {
    model: MODEL_NAME,

    messages: [
      {
        role: 'user',

        content: [
          {
            type: 'text',
            text: PROMPT_TEXT,
          },
          {
            type: 'image_url',
            image_url: {
              url: imageData,
            },
          },
        ],
      },
    ],

    temperature: 0.1,
  };

  try {
    console.log('Sending image to local Unsloth Qwen3-VL API...');

    const response = await fetch(API_URL, {
      method: 'POST',

      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },

      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    // Always log useful information when the server rejects the request.
    if (!response.ok) {
      console.error(
        `Unsloth API request failed - HTTP ${response.status}`,
        responseText
      );

      throw new Error(
        `Server returned HTTP ${response.status}: ${
          responseText || response.statusText
        }`
      );
    }

    console.log('Unsloth API response received.');

    let data;

    try {
      data = JSON.parse(responseText);
    } catch (error) {
      console.error(
        'Failed to parse Unsloth response as JSON:',
        responseText
      );

      throw new Error(
        'The Unsloth server returned an invalid JSON response.'
      );
    }

    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      console.error('Unexpected Unsloth API response:', data);

      throw new Error(
        'The vision model did not return any analysis.'
      );
    }

    console.log('Raw Qwen3-VL response:', rawContent);

    // The model may occasionally wrap the JSON in Markdown code fences.
    let cleanedContent = rawContent.trim();

    cleanedContent = cleanedContent
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const result = JSON.parse(cleanedContent);

      console.log('Parsed ergonomics result:', result);

      return result;
    } catch (error) {
      console.error(
        'Qwen3-VL returned content that is not valid JSON:',
        cleanedContent
      );

      throw new Error(
        'The model responded, but its response was not valid JSON.'
      );
    }
  } catch (error) {
    console.error('Image analysis request failed:', error);

    throw error;
  }
}

