import { describe, expect, it } from 'vitest';

import { isListingPage } from './listing-page';

describe('isListingPage', () => {
  it.each([
    'https://www.synbiobeta.com/categories/food-agriculture',
    'https://www.synbiobeta.com/categories/food-agriculture/',
    'https://greenqueen.com.hk/category/food-tech/',
    'https://greenqueen.com.hk/category/food-tech/page/3/',
    'https://www.fooddive.com/topic/ingredients/',
    'https://www.genengnews.com/topics/bioprocessing/',
    'https://www.biospace.com/tag/fermentation',
    'https://agfundernews.com/author/jane-doe',
    'https://www.foodnavigator.com/Sections/Proteins',
    'https://www.prnewswire.com/news-releases/food-beverages-latest-news/food-beverages-latest-news-list/',
    'https://www.prnewswire.com/news-releases/',
    'https://www.fiercebiotech.com/',
    'https://www.businesswire.com/newsroom',
    'https://www.nutraingredients.com/search?q=sweet+protein',
    'https://example.com/index.html',
  ])('flags %s', (url) => {
    expect(isListingPage(url)).toBe(true);
  });

  it.each([
    'https://www.genengnews.com/topics/bioprocessing/precision-fermentation-scales-up/',
    'https://www.fooddive.com/news/sweet-protein-startup-raises-series-b/712345/',
    'https://www.prnewswire.com/news-releases/oobli-announces-partnership-302112345.html',
    'https://www.synbiobeta.com/read/sweet-proteins-are-coming',
    'https://cen.acs.org/business/food-ingredients/sweet-proteins/104/i12',
    'https://www.foodnavigator.com/Article/2026/03/02/sweet-protein-approval',
    'https://www.businesswire.com/news/home/20260301005123/en/',
  ])('keeps the article %s', (url) => {
    expect(isListingPage(url)).toBe(false);
  });

  it('flags WordPress archive titles', () => {
    const url = 'https://example.com/food-tech/';
    expect(isListingPage(url, 'Food Tech Archives - Green Queen')).toBe(true);
    expect(isListingPage(url, 'Category: Food Tech')).toBe(true);
    expect(isListingPage(url, 'Oobli raises $18M for sweet proteins')).toBe(false);
  });

  it('keeps unparseable URLs', () => {
    expect(isListingPage('not a url')).toBe(false);
  });
});
