const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

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

async function fetchAdditionalData(username) {
  try {
    // Read and parse the HAR file
    const harFilePath = path.join(__dirname, 'www.tiktok.com.har');
    const harData = JSON.parse(fs.readFileSync(harFilePath, 'utf8'));

    // Find the relevant API calls
    const userDetailEntry = harData.log.entries.find(entry => 
      entry.request.url.includes('/api/user/detail/') && 
      entry.request.url.includes(username)
    );

    const itemListEntry = harData.log.entries.find(entry => 
      entry.request.url.includes('/api/post/item_list/')
    );

    if (!userDetailEntry || !itemListEntry) {
      throw new Error('Required API calls not found in HAR file');
    }

    // Extract and parse the JSON responses
    const userData = JSON.parse(userDetailEntry.response.content.text);
    const videoData = JSON.parse(itemListEntry.response.content.text);

    // Process and return the combined data
    return {
      user: userData.userInfo,
      videos: videoData.itemList
    };
  } catch (error) {
    console.error('Error processing HAR data:', error);
    return null;
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

async function parseHarFile(filePath) {
  try {
    const harData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return harData.log.entries;
  } catch (error) {
    console.error('Error parsing HAR file:', error);
    return null;
  }
}

async function extractUserData(entries, username) {
  const userDetailEntry = entries.find(entry => 
    entry.request.url.includes('/api/user/detail/') && 
    entry.request.url.includes(username)
  );

  if (!userDetailEntry) {
    console.error('User detail API call not found in HAR file');
    return null;
  }

  const userData = JSON.parse(userDetailEntry.response.content.text);
  const userInfo = userData.userInfo;

  return {
    id: userInfo.user.id,
    uniqueId: userInfo.user.uniqueId,
    nickname: userInfo.user.nickname,
    avatarLarger: userInfo.user.avatarLarger,
    signature: userInfo.user.signature,
    verified: userInfo.user.verified,
    followerCount: userInfo.stats.followerCount,
    followingCount: userInfo.stats.followingCount,
    heart: userInfo.stats.heart,
    videoCount: userInfo.stats.videoCount
  };
}

async function extractVideoData(entries) {
  const itemListEntry = entries.find(entry => 
    entry.request.url.includes('/api/post/item_list/')
  );

  if (!itemListEntry) {
    console.error('Video list API call not found in HAR file');
    return null;
  }

  const videoData = JSON.parse(itemListEntry.response.content.text);
  return videoData.itemList.map(item => ({
    id: item.id,
    desc: item.desc,
    createTime: item.createTime,
    video: {
      id: item.video.id,
      height: item.video.height,
      width: item.video.width,
      duration: item.video.duration,
      ratio: item.video.ratio,
      cover: item.video.cover,
      playAddr: item.video.playAddr
    },
    author: {
      id: item.author.id,
      uniqueId: item.author.uniqueId,
      nickname: item.author.nickname
    },
    stats: {
      diggCount: item.stats.diggCount,
      shareCount: item.stats.shareCount,
      commentCount: item.stats.commentCount,
      playCount: item.stats.playCount
    }
  }));
}

async function scrapeUserData(username) {
  // Capture network data and get HAR file path
  const harFilePath = await captureNetworkData(username);

  // Parse HAR file
  const entries = await parseHarFile(harFilePath);

  if (!entries) {
    return null;
  }

  const userData = await extractUserData(entries, username);
  const videoData = await extractVideoData(entries);

  return {
    user: userData,
    videos: videoData
  };
}

async function captureNetworkData(username) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Enable request interception
  await page.setRequestInterception(true);
  
  const requests = [];
  page.on('request', request => {
    requests.push(request);
    request.continue();
  });

  // Navigate to the TikTok user's page
  await page.goto(`https://www.tiktok.com/@${username}`, { waitUntil: 'networkidle0' });

  // Scroll to load more content if needed
  // await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  // await page.waitForTimeout(2000); // Wait for any additional requests

  // Generate HAR file
  const har = {
    log: {
      version: '1.2',
      creator: { name: 'Puppeteer', version: '1.0' },
      entries: requests.map(request => ({
        request: {
          url: request.url(),
          method: request.method(),
          headers: request.headers(),
        },
        response: request.response() ? {
          status: request.response().status(),
          headers: request.response().headers(),
        } : {},
      })),
    },
  };

  await browser.close();

  // Save HAR file
  const harFilePath = path.join(__dirname, `${username}_tiktok.har`);
  fs.writeFileSync(harFilePath, JSON.stringify(har, null, 2));

  return harFilePath;
}

// Example usage
async function main() {
  const username = 'charlidamelio'; // Replace with the desired username
  const result = await scrapeUserData(username);

  if (result) {
    console.log('User Data:', JSON.stringify(result.user, null, 2));
    console.log('Video Data:', JSON.stringify(result.videos, null, 2));
    
    // Optionally, save to a file
    fs.writeFileSync('tiktok_data.json', JSON.stringify(result, null, 2));
    console.log('Data saved to tiktok_data.json');
  } else {
    console.log('Failed to scrape data');
  }
}

main().catch(console.error);