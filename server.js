const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Stealth Plugin එක enable කිරීම (Bot Detection එක නැති කරනවා)
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

let browserInstance;

async function getBrowser() {
    if (!browserInstance || !browserInstance.isConnected()) {
        browserInstance = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ]
        });
    }
    return browserInstance;
}

// 🔍 1. සයිට් එක Search කරලා මූවී එකේ URL එක ගන්න එක
async function searchMovie(query) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(query)}`;
        console.log(`🔍 Searching: ${searchUrl}`);
        
        // සයිට් එක හරියටම ලෝඩ් වෙන්න networkidle2 දක්වා බලාගෙන ඉන්නවා
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 45000 });
        
        // තව තත්පර 2ක් පමණ බලාගෙන ඉන්නවා (JS Menus වලින් Load වෙන දේවල් සඳහා)
        await new Promise(r => setTimeout(r, 2000));

        // හරියම Search Result Article එකෙන් ලින්ක් එක ගන්නවා
        const result = await page.evaluate(() => {
            // සාමාන්‍යයෙන් මූවී සයිට් වල Search Results එන්නේ article tag එකකින්
            const firstArticle = document.querySelector('article');
            if (firstArticle) {
                const link = firstArticle.querySelector('a');
                const title = firstArticle.querySelector('h2 a, h3 a, .title a, .entry-title a');
                
                if (link) {
                    return {
                        movieLink: link.href,
                        movieTitle: title ? title.innerText.trim() : (link.innerText || '').trim()
                    };
                }
            }
            return null;
        });

        if (!result || !result.movieLink) return null;
        
        console.log(`✅ Found Movie: ${result.movieTitle} - ${result.movieLink}`);
        return { title: result.movieTitle || 'Unknown Movie', moviePageUrl: result.movieLink };
        
    } catch (error) {
        console.error("Search Error:", error.message);
        return null;
    } finally {
        await page.close();
    }
}

// 📥 2. මූවී පේජ් එකට ගිහින් Direct CDN Links ගන්න එක
async function scrapeDownloadLinks(pageUrl) {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        console.log(`📥 Visiting Movie Page: ${pageUrl}`);
        
        await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 45000 });
        await new Promise(r => setTimeout(r, 2000));

        const downloadLinks = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const results = [];
            
            links.forEach(a => {
                const href = a.href || '';
                const text = a.innerText || '';
                
                if (href.includes('cdn.sinhalasub') || href.includes('.mp4') || href.includes('pixeldrain.com')) {
                    
                    let quality = 'Unknown';
                    if (text.includes('1080') || text.toLowerCase().includes('fhd')) quality = 'FHD 1080p';
                    else if (text.includes('720') || text.toLowerCase().includes('hd')) quality = 'HD 720p';
                    else if (text.includes('480') || text.toLowerCase().includes('sd')) quality = 'SD 480p';
                    
                    if (quality === 'Unknown') {
                        if (href.includes('1080')) quality = 'FHD 1080p';
                        else if (href.includes('720')) quality = 'HD 720p';
                        else if (href.includes('480')) quality = 'SD 480p';
                    }
                    results.push({ quality: quality, download_url: href });
                }
            });

            const uniqueResults = [];
            const seenUrls = new Set();
            results.forEach(item => {
                if (!seenUrls.has(item.download_url)) { 
                    seenUrls.add(item.download_url); 
                    uniqueResults.push(item); 
                }
            });
            return uniqueResults;
        });

        // Direct Links හමු නොවුණොත් Debug සඳහා සියලුම ලින්ක්ස් Log කරයි
        if (downloadLinks.length === 0) {
            console.log("⚠️ No cdn links found. Logging all links for debug...");
            const allLinks = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('a')).map(a => ({ 
                    text: (a.innerText||'').trim().substring(0, 30), 
                    href: a.href 
                }));
            });
            allLinks.forEach((l, i) => console.log(`${i}. ${l.text} -> ${l.href}`));
        }

        return downloadLinks;
    } catch (error) {
        console.error("Scraping Error:", error.message);
        return null;
    } finally {
        await page.close();
    }
}

// 🌐 3. API Endpoint එක
app.get('/api/movie', async (req, res) => {
    const movieName = req.query.name;
    
    if (!movieName) { 
        return res.status(400).json({ status: false, error: "Please provide a movie name (?name=movie_name)" }); 
    }

    console.log(`🎬 Request received for: ${movieName}`);
    
    const movieInfo = await searchMovie(movieName);
    if (!movieInfo) { 
        return res.json({ status: false, message: "කණගාටුයි, එම චිත්‍රපටය හමු වූයේ නැත." }); 
    }

    const downloadLinks = await scrapeDownloadLinks(movieInfo.moviePageUrl);
    if (!downloadLinks || downloadLinks.length === 0) { 
        return res.json({ 
            status: false, 
            message: `"${movieInfo.title}" චිත්‍රපටය හමු විය, නමුත් Direct Download ලින්ක්ස් හමු වූයේ නැත.` 
        }); 
    }

    res.json({
        status: true,
        owner: "@heshan",
        title: movieInfo.title,
        result: downloadLinks
    });
});

// Server Start කිරීම
app.listen(PORT, () => { 
    console.log(`🚀 Sinhalasub Scraper API running on http://localhost:${PORT}`); 
});
