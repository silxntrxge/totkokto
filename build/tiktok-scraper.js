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
      let items = await this.parseResponse(response.data);
      
      if (items.length === 0) {
        this.logger.log('No items found in initial parse, fetching additional data...');
        items = await this.fetchAdditionalData(this.params.input);
      }
      
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
      const items = await this.parseResponse(response.data, 'hashtag');
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
    const $ = cheerio.load(html);
    let items = [];

    // Try to extract SIGI_STATE
    const sigiStateScript = $('script#SIGI_STATE').first();
    if (sigiStateScript.length) {
      try {
        const sigiState = JSON.parse(sigiStateScript.html());
        if (sigiState.ItemModule) {
          items = Object.values(sigiState.ItemModule);
        }
      } catch (e) {
        this.logger.error('Error parsing SIGI_STATE:', e);
      }
    }

    // If SIGI_STATE doesn't work, try NEXT_DATA
    if (items.length === 0) {
      const nextDataScript = $('script#__NEXT_DATA__').first();
      if (nextDataScript.length) {
        try {
          const nextData = JSON.parse(nextDataScript.html());
          const userData = nextData.props.pageProps.userInfo;
          const videosData = nextData.props.pageProps.items;
          
          if (userData) {
            this.userInfo = {
              id: userData.user.id,
              uniqueId: userData.user.uniqueId,
              nickname: userData.user.nickname,
              avatarLarger: userData.user.avatarLarger,
              signature: userData.user.signature,
              verified: userData.user.verified,
            };
          }
          
          if (Array.isArray(videosData)) {
            items = videosData;
          }
        } catch (e) {
          this.logger.error('Error parsing NEXT_DATA:', e);
        }
      }
    }

    // If still no items, fallback to HTML parsing
    if (items.length === 0) {
      this.logger.log('Falling back to HTML parsing');
      $('div[data-e2e="user-post-item"]').each((index, element) => {
        const videoElement = $(element).find('div[data-e2e="user-post-item-video"]');
        if (videoElement.length) {
          const videoId = videoElement.attr('data-video-id');
          const videoDesc = $(element).find('div[data-e2e="user-post-item-desc"]').text();
          items.push({
            id: videoId,
            desc: videoDesc,
          });
        }
      });
    }

    this.logger.log(`Parsing complete. Collected items: ${items.length}`);
    return items;
  }

  async scrapeComments(postId, maxComments = 20) {
    this.logger.log(`Scraping comments for post ID: ${postId}`);
    try {
      const url = `https://www.tiktok.com/api/comment/list/?aweme_id=${postId}&count=${maxComments}&cursor=0`;
      const response = await this.makeRequest(url);
      const data = JSON.parse(response.data);
      const comments = data.comments.map(comment => ({
        text: comment.text,
        createTime: comment.create_time,
        diggCount: comment.digg_count,
        replyCount: comment.reply_comment_total,
        author: {
          id: comment.user.uid,
          nickname: comment.user.nickname,
          avatarThumb: comment.user.avatar_thumb.url_list[0]
        }
      }));
      this.logger.log(`Scraped ${comments.length} comments`);
      return comments;
    } catch (error) {
      this.logger.error('Error scraping comments:', error);
      throw error;
    }
  }

  async scrapeSearch(keyword, maxResults = 20) {
    this.logger.log(`Scraping search results for keyword: ${keyword}`);
    try {
      const url = `https://www.tiktok.com/api/search/general/full/?aid=1988&keyword=${encodeURIComponent(keyword)}&offset=0&count=${maxResults}`;
      const response = await this.makeRequest(url);
      const data = JSON.parse(response.data);
      const results = data.data.map(item => ({
        id: item.item.id,
        desc: item.item.desc,
        createTime: item.item.createTime,
        video: {
          id: item.item.video.id,
          cover: item.item.video.cover,
          playAddr: item.item.video.playAddr
        },
        author: {
          id: item.item.author.id,
          uniqueId: item.item.author.uniqueId,
          nickname: item.item.author.nickname
        }
      }));
      this.logger.log(`Scraped ${results.length} search results`);
      return results;
    } catch (error) {
      this.logger.error('Error scraping search results:', error);
      throw error;
    }
  }

  async fetchAdditionalData(username, maxItems = 30) {
    this.logger.log(`Fetching additional data for user: ${username}`);
    const url = `https://www.tiktok.com/api/user/detail/?uniqueId=${username}`;
    try {
      const response = await this.makeRequest(url);
      const data = JSON.parse(response.data);
      
      if (data.userInfo) {
        this.userInfo = {
          ...this.userInfo,
          followerCount: data.userInfo.stats.followerCount,
          followingCount: data.userInfo.stats.followingCount,
          heartCount: data.userInfo.stats.heartCount,
          videoCount: data.userInfo.stats.videoCount,
        };
      }

      // Fetch user's videos
      const videosUrl = `https://www.tiktok.com/api/post/item_list/?aid=1988&secUid=${data.userInfo.user.secUid}&count=${maxItems}`;
      const videosResponse = await this.makeRequest(videosUrl);
      const videosData = JSON.parse(videosResponse.data);
      
      if (videosData.itemList) {
        return videosData.itemList;
      }
    } catch (error) {
      this.logger.error('Error fetching additional data:', error);
    }
    return [];
  }
}

export default TikTokScraper;