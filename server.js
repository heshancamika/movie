const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const config = require('./config');

const app = express();

// 🛠️ Axios Client එක සෙට් කිරීම
const client = axios.create({
    baseURL: config.SITE_URL,
    timeout: 15000,
    headers: {
        'User-Agent': config.USER_AGENT,
        'Cookie': config.COOKIE,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    }
});

// 📥 Sinhalasub මූවී පේජ් URL එක ඇතුළෙන් හැම Quality එකකම ලින්ක්ස් සහ සයිස් ඇදලා ගන්නා කොටස
async function scrapeAllLinks(pageUrl) {
    try {
        const { data } = await client.get(pageUrl);
        const $ = cheerio.load(data);
        
        let results = [];
        
        // පේජ් එකේ ප්‍රධාන Title එක (මූවී එකේ නම) ගන්නවා
        const pageTitle = $('h1.entry-title').text().trim() || $('h1').first().text().trim() || "Unknown Movie";

        // 🔍 සයිට් එකේ තියෙන හැම <a> tag එකක්ම පීරලා බලනවා
        $('a').each((i, el) => {
            const href = $(el).attr('href') || '';
            const linkText = $(el).text().trim().toLowerCase();
            const parentText = $(el).parent().text().trim().toLowerCase();
            
            // ලින්ක් එකේ හෝ එයට සම්බන්ධ තැන්වල pixeldrain හරි download හරි තියෙනවද බලනවා
            if (href.includes('pixeldrain.com') || href.includes('sinhalasub.lk/download/')) {
                let quality = "Unknown";
                let size = "Unknown";

                // Quality එක හොයාගැනීම (ලින්ක් එකේ text එකෙන් හෝ parent div එකෙන්)
                const fullCheckText = `${linkText} ${parentText} ${href}`;
                
                if (fullCheckText.includes('1080p')) quality = 'FHD 1080p';
                else if (fullCheckText.includes('720p')) quality = 'HD 720p';
                else if (fullCheckText.includes('480p')) quality = 'SD 480p';

                // ෆයිල් සයිස් එක වෙන් කරගැනීම (GB හෝ MB තියෙන රටාවන්)
                const sizeMatch = $(el).text().trim().match(/(\d+(\.\d+)?\s*(GB|MB))/i) || $(el).parent().text().trim().match(/(\d+(\.\d+)?\s*(GB|MB))/i);
                if (sizeMatch) {
                    size = sizeMatch[1];
                }

                // Pixeldrain ලින්ක් එකක් නම් කෙලින්ම Direct Link එකක් බවට හැරවීම
                let directUrl = href;
                if (href.includes('pixeldrain.com/u/')) {
                    directUrl = href.replace('/u/', '/api/file/');
                }

                // ඩියුප්ලිකේට් (එකම ලින්ක් එක දෙපාරක්) වැටෙන එක නවත්වන්න
                const isExist = results.some(item => item.download_url === directUrl);

                if (!isExist && href !== '') {
                    results.push({
                        quality: quality,
                        size: size,
                        download_url: directUrl
                    });
                }
            }
        });

        return { pageTitle, results };
    } catch (error) {
        console.error("📥 Scraping Links Error:", error.message);
        return null;
    }
}

// 🌐 API Endpoint
app.get('/sinhala-sub-download', async (req, res) => {
    const targetUrl = req.query.url;
    
    if (!targetUrl || !targetUrl.includes('sinhalasub.lk/')) {
        return res.status(400).json({ 
            status: false, 
            error: "කරුණාකර නිවැරදි Sinhalasub මූවී ලින්ක් එකක් ඇතුළත් කරන්න." 
        });
    }

    console.log(`🔗 Scraping Request Received for URL: ${targetUrl}`);
    
    const scrapeData = await scrapeAllLinks(targetUrl);
    
    if (!scrapeData || scrapeData.results.length === 0) {
        return res.json({ 
            status: false, 
            message: "මෙම ලින්ක් එකෙන් ඩවුන්ලෝඩ් ලින්ක්ස් ලබා ගැනීමට නොහැකි විය. කරුණාකර ලින්ක් එක නිවැරදිදැයි පරීක්ෂා කරන්න." 
        });
    }

    // 🚀 JSON Response
    res.json({
        status: true,
        owner: "@KingPoddaModz",
        title: scrapeData.pageTitle,
        result: scrapeData.results
    });
});

// සර්වර් එක ස්ටාර්ට් කිරීම
app.listen(config.PORT, () => {
    console.log(`🚀 Clean URL Scraper API is running on port ${config.PORT}`);
});
