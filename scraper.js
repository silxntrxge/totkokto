const axios = require('axios');
const cheerio = require('cheerio');

const headers = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  'referer': 'https://www.tiktok.com/@charlidamelio',
  'cookie': '...' // We'll need to handle cookies properly
};

async function fetchAdditionalData(username) {
  const userDetailUrl = `https://www.tiktok.com/@${username}`;
  
  try {
    console.log(`Making GET request to ${userDetailUrl}`);
    const response = await axios.get(userDetailUrl, { headers });
    console.log(`Request successful. Response status: ${response.status}`);
    
    // Try to find any JSON data in script tags
    const $ = cheerio.load(response.data);
    const scripts = $('script').map((i, el) => $(el).html()).get();

    let extractedData = {};

    for (const script of scripts) {
      try {
        const jsonData = JSON.parse(script);
        extractedData = { ...extractedData, ...jsonData };
      } catch (e) {
        // If it's not valid JSON, try to find JSON-like structures
        const jsonMatches = script.match(/\{[^{}]*\}/g);
        if (jsonMatches) {
          jsonMatches.forEach(match => {
            try {
              const parsedMatch = JSON.parse(match);
              extractedData = { ...extractedData, ...parsedMatch };
            } catch (e) {
              // Ignore parsing errors for individual matches
            }
          });
        }
      }
    }

    // Extract any visible text data
    const visibleText = $('body').text();

    return {
      extractedData,
      visibleText,
      fullHtml: response.data
    };
  } catch (error) {
    console.error('Error fetching additional data:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
    return {
      error: error.message,
      responseStatus: error.response ? error.response.status : null,
      responseHeaders: error.response ? error.response.headers : null
    };
  }
}

// This function can be called by your API or make.com module
async function scrapeUserData(username) {
  try {
    const result = await fetchAdditionalData(username);
    return result;
  } catch (error) {
    console.error('Error in scrapeUserData:', error);
    return { error: error.message };
  }
}

module.exports = { scrapeUserData };