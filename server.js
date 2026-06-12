// 📥 2. මූවී පේජ් එකට ගිහින් ලින්ක්ස් ගන්න එක (Debug Mode)
async function scrapeDownloadLinks(pageUrl) {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log(`\n📥 Visiting Movie Page: ${pageUrl}`);
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // 1. පේජ් එකේ තියෙන හැම ලින්ක් එකක්ම අරගෙන Console එකට ප්‍රින්ට් කරමු (මේක තමයි වැදගත්)
        const allLinks = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            return links.map(a => ({
                text: (a.innerText || '').trim().substring(0, 50), // ලින්ක් එකේ ටෙක්ස්ට් එක
                href: a.href || ''                                  // ලින්ක් එකේ URL එක
            }));
        });

        console.log(`\n================ DEBUG: LINKS ON PAGE ================`);
        allLinks.forEach((link, i) => {
            // හිස් හා අනවශ්‍ය ලින්ක්ස් පෙන්නන්නේ නැතුව ප්‍රින්ට් කරමු
            if(link.href && link.href !== '#' && !link.href.startsWith('javascript')) {
                console.log(`${i + 1}. Text: "${link.text}" | URL: ${link.href}`);
            }
        });
        console.log(`======================================================\n`);

        // 2. දැන් අපිට ඕනේ ඒ ලින්ක්ස් වලින් Direct Download එක හොයන්න
        const downloadLinks = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const results = [];
            
            links.forEach(a => {
                const href = a.href || '';
                const text = a.innerText || '';
                
                // අපි හිතන්නේ ලින්ක් එකේ cdn, .mp4 හෝ pixeldrain වගේ දේවල් තියෙනවා කියලා
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

                    results.push({
                        quality: quality,
                        download_url: href
                    });
                }
            });

            // Duplicate ලින්ක්ස් ඉවත් කිරීම
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

        return downloadLinks;
    } catch (error) {
        console.error("Scraping Error:", error.message);
        return null;
    } finally {
        await page.close();
    }
        }
