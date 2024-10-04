import axios from 'axios';
import { getRandomUserAgent } from './constant.js';
import * as cheerio from 'cheerio';

class TikTokScraper {
  constructor(options = {}) {
    this.params = options.params || {};
    this.axios = axios.create({
      headers: {
        'user-agent': options.headers?.['user-agent'] || getRandomUserAgent(),
      },
    });
    this.logger = options.logger || console;
    this.logger.log(`[${new Date().toISOString()}] TikTokScraper: Constructor called with params:`, this.params);
  }

  async scrape(params) {
    this.logger.log('Starting scrape operation...');
    try {
      this.params = { ...this.params, ...params };
      let items = [];
      switch (this.params.type) {
        case 'user':
          this.logger.log('Scraping user feed...');
          items = await this.getUserFeed();
          break;
        case 'hashtag':
          this.logger.log('Scraping hashtag feed...');
          items = await this.getHashtagFeed();
          break;
        case 'trend':
          this.logger.log('Scraping trending feed...');
          items = await this.getTrendingFeed();
          break;
        default:
          throw new Error('Invalid scrape type');
      }

      this.logger.log(`Scrape completed. Found ${items.length} items.`);
      return {
        collector: items,
        // ... (other properties if needed)
      };
    } catch (error) {
      this.logger.error('Error during scrape operation:', error);
      throw error;
    }
  }

  async getUserFeed() {
    this.logger.log('Fetching user feed...');
    try {
      const url = `https://www.tiktok.com/@${this.params.input}`;
      this.logger.log(`Making request to TikTok API: ${url}`);
      const response = await this.axios.get(url);
      this.logger.log('Received response from TikTok API:', response.status);
      const items = await this.parseResponse(response.data);
      this.logger.log(`Processed ${items.length} items from user feed`);
      return items;
    } catch (error) {
      this.logger.error('Error fetching user feed:', error);
      throw error;
    }
  }

  async getHashtagFeed() {
    this.logger.log(`Fetching hashtag feed for #${this.params.input}...`);
    try {
      const url = `https://www.tiktok.com/tag/${this.params.input}`;
      this.logger.log('Making request to TikTok API:', url);
      const response = await this.makeRequest(url);
      this.logger.log('Received response from TikTok API:', response.status);
      const items = await this.parseResponse(response.data);
      this.logger.log(`Processed ${items.length} items from hashtag feed`);
      return items;
    } catch (error) {
      this.logger.error('Error fetching hashtag feed:', error);
      throw error;
    }
  }

  async getTrendingFeed() {
    this.logger.log('Fetching trending feed...');
    try {
      const url = `https://www.tiktok.com/trending`;
      this.logger.log(`Making request to TikTok API: ${url}`);
      const response = await this.axios.get(url);
      this.logger.log('Received response from TikTok API:', response.status);
      const items = await this.parseResponse(response.data);
      this.logger.log(`Processed ${items.length} items from trending feed`);
      return items;
    } catch (error) {
      this.logger.error('Error fetching trending feed:', error);
      throw error;
    }
  }

  async makeRequest(url, retries = 3) {
    this.logger.log(`Making GET request to ${url}`);
    for (let i = 0; i < retries; i++) {
      try {
        this.logger.log(`Attempt ${i + 1} to fetch URL`);
        const response = await this.axios.get(url);
        this.logger.log('Request successful. Response status:', response.status);
        return response;
      } catch (error) {
        this.logger.error(`Request failed (attempt ${i + 1}):`, error.message);
        if (i === retries - 1) throw error;
        this.logger.log(`Waiting before retry...`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
      }
    }
  }

  async parseResponse(html) {
    this.logger.log(`Starting parseResponse method. HTML length: ${html.length}`);

    const $ = cheerio.load(html);
    const collector = [];

    this.logger.log(`Applying cheerio to find video items`);

    // Look for a script tag containing the string "SIGI_STATE"
    const scriptContent = $('script:contains("SIGI_STATE")').html();
    
    if (scriptContent) {
      try {
        // Extract the JSON data from the script content
        const jsonStr = scriptContent.match(/SIGI_STATE[^{]+({.+});/)[1];
        const data = JSON.parse(jsonStr);

        // Extract video items from the parsed data
        const items = data.ItemModule;
        
        for (const id in items) {
          const item = items[id];
          collector.push({
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
              originCover: item.video.originCover,
              dynamicCover: item.video.dynamicCover,
              playAddr: item.video.playAddr,
              downloadAddr: item.video.downloadAddr,
            },
            author: {
              id: item.author.id,
              uniqueId: item.author.uniqueId,
              nickname: item.author.nickname,
              avatarThumb: item.author.avatarThumb,
            },
            music: {
              id: item.music.id,
              title: item.music.title,
              playUrl: item.music.playUrl,
              coverThumb: item.music.coverThumb,
              authorName: item.music.authorName,
              original: item.music.original,
            },
            stats: {
              diggCount: item.stats.diggCount,
              shareCount: item.stats.shareCount,
              commentCount: item.stats.commentCount,
              playCount: item.stats.playCount,
            },
          });
        }
      } catch (error) {
        this.logger.error('Error parsing SIGI_STATE data:', error);
      }
    }

    if (collector.length === 0) {
      this.logger.log('No items found in SIGI_STATE, falling back to HTML parsing');
      
      // Fallback to the original HTML parsing method
      $('div[data-e2e="recommend-list-item-container"]').each((index, element) => {
        const videoContainer = $(element);
        const videoElement = videoContainer.find('div[data-e2e="video-player"]');
        
        const videoId = videoElement.attr('data-video-id');
        const videoTitle = videoContainer.find('div[data-e2e="video-desc"]').text().trim();
        const videoUrl = videoElement.find('video').attr('src');

        if (videoId && videoTitle && videoUrl) {
          collector.push({
            id: videoId,
            title: videoTitle,
            url: videoUrl,
          });
          this.logger.log(`Found video item: ID=${videoId}, Title=${videoTitle}, URL=${videoUrl}`);
        }
      });
    }

    this.logger.log(`Parsing complete. Collected items: ${collector.length}`);

    return collector;
  }
}

export default TikTokScraper;