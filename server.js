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

// 🔍 1. මූවී එක සර්ච් කරලා පළවෙනි පෝස්ට් එකේ URL එක ගන්නා කොටස
async function searchMovie(query) {
    try {
        const searchPath = `/?s=${encodeURIComponent(query)}`;
        const { data } = await client.get(searchPath);
        const $ = cheerio.load(data);
        
        let moviePageUrl = null;
        let title = null;

        const firstResult = $('div.result-item article').first();
        if (firstResult.length) {
            title = firstResult.find('div.title a').text().trim();
            moviePageUrl = firstResult.find('div.title a').attr('href');
        } 
        
        if (!moviePageUrl) {
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().toLowerCase();
                
                if (href && (href.includes('/?p=') || (href.includes('sinhalasub.lk/') && !href.includes('/category/') && !href.includes('/tag/') && text.includes(query.toLowerCase())))) {
                    moviePageUrl = href;
                    title = $(el).text().trim() || query;
                    return false;
                }
            });
        }

        if (!moviePageUrl) return null;
        return { title, moviePageUrl };
    } catch (error) {
        console.error("🔍 Search Error:", error.message);
        return null;
    }
}

// 📥 2. මූවී පේජ් එක ඇතුළෙන් හැම Quality එකකම ලින්ක්ස් සහ සයිස් ඇදලා ගන්නා කොටස
async function scrapeAllLinks(pageUrl) {
    try {
        const { data } = await client.get(pageUrl);
        const $ = cheerio.load(data);
        
        let results = [];

        // Sinhalasub සයිට් එකේ ඩවුන්ලෝඩ් බොක්ස් එක ඇතුළේ තියෙන හැම ලින්ක් එකක්ම ලූප් කරනවා
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            
            // Pixeldrain ලින්ක් එකක් තියෙන ඒවා විතරක් ෆිල්ටර් කරගන්නවා
            if (href && href.includes('pixeldrain.com/u/')) {
                const linkText = $(el).text().trim(); // බොත්තමේ තියෙන අකුරු (උදා: SD 480p (927 MB) වගේ)
                let quality = "Unknown";
                let size = "Unknown";

                // ලින්ක් එකේ text එකෙන් Quality එකයි Size එකයි වෙන් කරගන්නා RegEx ක්‍රමයක්
                // උදාහරණ: "HD 720p (1.77 GB)" වගේ ඒවයින් 720p සහ 1.77 GB වෙන් කරයි
                if (linkText.includes('1080p')) quality = 'FHD 1080p';
                else if (linkText.includes('720p')) quality = 'HD 720p';
                else if (linkText.includes('480p')) quality = 'SD 480p';

                const sizeMatch = linkText.match(/\(([^)]+)\)/);
                if (sizeMatch && sizeMatch[1]) {
                    size = sizeMatch[1];
                }

                // Pixeldrain එක Direct Link එකක් බවට හැරවීම
                const directUrl = href.replace('/u/', '/api/file/');

                results.push({
                    quality: quality,
                    size: size,
                    download_url: directUrl
                });
            }
        });

        return results;
    } catch (error) {
        console.error("📥 Scraping Links Error:", error.message);
        return [];
    }
}

// 🌐 3. API Endpoint
app.get('/api/movie', async (req, res) => {
    const movieName = req.query.name;
    
    if (!movieName) {
        return res.status(400).json({ status: false, error: "කරුණාකර මූවී එකේ නම ඇතුළත් කරන්න." });
    }

    console.log(`🎬 Request received for: ${movieName}`);
    
    // මූවී එක සර්ච් කිරීම
    const movieInfo = await searchMovie(movieName);
    if (!movieInfo) {
        return res.json({ status: false, message: "කණගාටුයි, එම චිත්‍රපටය සොයා ගැනීමට නොහැකි විය." });
    }

    // ඔක්කොම ලින්ක්ස් ටික එකපාර ඇදලා ගැනීම
    const linksList = await scrapeAllLinks(movieInfo.moviePageUrl);
    if (!linksList || linksList.length === 0) {
        return res.json({ status: false, message: "චිත්‍රපටය හමු විය, නමුත් ඩවුන්ලෝඩ් ලින්ක්ස් හමු වූයේ නැත." });
    }

    // 🚀 ඔයා ඉල්ලපු සුපිරි නිමැවුම (Response Format)
    res.json({
        status: true,
        owner: "@KingPoddaModz",
        title: movieInfo.title, // මූවී එකේ නමත් බලාගන්න ලේසි වෙන්න දැම්මා
        result: linksList
    });
});

// සර්වර් එක ස්ටාර්ට් කිරීම
app.listen(config.PORT, () => {
    console.log(`🚀 API Server is running on port ${config.PORT}`);
});
