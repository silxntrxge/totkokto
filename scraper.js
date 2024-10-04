const axios = require('axios');
const cheerio = require('cheerio');

const headers = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  'referer': 'https://www.tiktok.com/@charlidamelio',
  'cookie': '...' // We'll need to handle cookies properly
};

const queryParams = new URLSearchParams({
  aid: '1988',
  app_language: 'en',
  app_name: 'tiktok_web',
  browser_language: 'en-US',
  browser_name: 'Mozilla',
  browser_platform: 'Win32',
  browser_version: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  channel: 'tiktok_web',
  cookie_enabled: 'true'
  // Add other necessary parameters
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async fetchAdditionalData(username) {
  const userDetailUrl = `https://www.tiktok.com/api/user/detail/?uniqueId=${username}`;
  const itemListUrl = `https://www.tiktok.com/api/post/item_list/?${queryParams.toString()}&secUid=${secUid}&userId=${userId}`;

  try {
    // Fetch user details
    const userResponse = await axios.get(userDetailUrl, { headers });
    console.log('Raw user response:', userResponse.data); // Log raw response for debugging

    // Check if response is empty or not a string
    if (!userResponse.data || typeof userResponse.data !== 'string') {
      console.log('Empty or invalid user response, falling back to HTML scraping');
      return this.scrapeUserPageHTML(username);
    }

    let userData;
    try {
      userData = JSON.parse(userResponse.data);
    } catch (parseError) {
      console.error('Error parsing user JSON:', parseError);
      console.log('Falling back to HTML scraping due to JSON parse error');
      return this.scrapeUserPageHTML(username);
    }

    // Add delay between requests
    await delay(1000); // 1 second delay

    // Fetch video list
    const videoResponse = await axios.get(itemListUrl, { headers });
    console.log('Raw video response:', videoResponse.data); // Log raw response for debugging

    // Check if response is empty or not a string
    if (!videoResponse.data || typeof videoResponse.data !== 'string') {
      console.log('Empty or invalid video response, falling back to HTML scraping');
      return this.scrapeUserPageHTML(username);
    }

    let videoData;
    try {
      videoData = JSON.parse(videoResponse.data);
    } catch (parseError) {
      console.error('Error parsing video JSON:', parseError);
      console.log('Falling back to HTML scraping due to JSON parse error');
      return this.scrapeUserPageHTML(username);
    }

    // Process and return the combined data
    return {
      user: userData,
      videos: videoData.items
    };
  } catch (error) {
    if (error.response && error.response.status === 429) {
      console.log('Rate limited. Waiting before retrying...');
      await delay(60000); // Wait for 1 minute
      return this.fetchAdditionalData(username); // Retry
    }
    console.error('Error fetching additional data:', error);
    console.log('Falling back to HTML scraping');
    return this.scrapeUserPageHTML(username);
  }
}

async scrapeUserPageHTML(username) {
  try {
    const url = `https://www.tiktok.com/@${username}`;
    const response = await axios.get(url, { headers });
    const $ = cheerio.load(response.data);

    // Extract user data
    const userData = {
      // Extract user details from HTML
      // This is a placeholder and needs to be implemented based on the actual HTML structure
      username: $('some-selector').text(),
      // ... other user details
    };

    // Extract video data
    const videos = [];
    $('some-video-selector').each((index, element) => {
      // Extract video details from HTML
      // This is a placeholder and needs to be implemented based on the actual HTML structure
      videos.push({
        id: $(element).attr('data-video-id'),
        // ... other video details
      });
    });

    return {
      user: userData,
      videos: videos
    };
  } catch (error) {
    console.error('Error scraping HTML:', error);
    return null;
  }
}