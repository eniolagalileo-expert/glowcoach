// A sample shop catalog for the demo. "Lumen & Leaf" is a fictional brand;
// products, prices, and ingredients are illustrative, not real listings.
// A retailer would swap in their own feed.

export const BRAND = 'Lumen & Leaf';

// concerns: skin-analysis concern names each product targets.
// types: skin types it suits ('oily', 'dry', 'combination', 'normal').
export const SKINCARE = [
  { id: 'cl-gel', step: 'cleanser', name: 'Clarity Gel Cleanser', ingredient: '0.5% salicylic acid', price: 16, tier: 1, concerns: ['acne', 'pore', 'oiliness'], types: ['oily', 'combination'] },
  { id: 'cl-cream', step: 'cleanser', name: 'Cloud Cream Cleanser', ingredient: 'ceramides + glycerin', price: 18, tier: 1, concerns: ['moisture', 'redness'], types: ['dry', 'normal', 'combination'] },
  { id: 'cl-balm', step: 'cleanser', name: 'Silk Balm Cleanser', ingredient: 'squalane + oat', price: 32, tier: 3, concerns: ['moisture', 'texture', 'redness'], types: ['dry', 'normal'] },

  { id: 'se-bha', step: 'treatment', name: 'Pore Refine BHA Serum', ingredient: '2% salicylic acid', price: 24, tier: 2, concerns: ['acne', 'pore', 'oiliness', 'texture'], types: ['oily', 'combination', 'normal'], time: 'pm' },
  { id: 'se-niacin', step: 'treatment', name: 'Even Tone Niacinamide 10%', ingredient: '10% niacinamide + zinc', price: 14, tier: 1, concerns: ['pore', 'oiliness', 'redness', 'acne'], types: ['oily', 'combination', 'normal', 'dry'], time: 'am' },
  { id: 'se-retinal', step: 'treatment', name: 'Night Renew Retinal', ingredient: '0.05% retinal', price: 42, tier: 3, concerns: ['wrinkle', 'texture', 'acne'], types: ['normal', 'combination', 'oily'], time: 'pm' },
  { id: 'se-peptide', step: 'treatment', name: 'Firm Peptide Serum', ingredient: 'peptides + hyaluronic acid', price: 29, tier: 2, concerns: ['wrinkle', 'moisture'], types: ['dry', 'normal', 'combination'], time: 'am' },
  { id: 'se-ha', step: 'treatment', name: 'Deep Drink Hyaluronic Serum', ingredient: 'multi-weight hyaluronic acid', price: 19, tier: 1, concerns: ['moisture', 'wrinkle'], types: ['dry', 'normal', 'combination', 'oily'], time: 'am' },
  { id: 'se-cica', step: 'treatment', name: 'Calm Cica Serum', ingredient: 'centella + panthenol', price: 22, tier: 2, concerns: ['redness', 'acne'], types: ['dry', 'normal', 'combination', 'oily'], time: 'pm' },
  { id: 'ey-caff', step: 'eye', name: 'Bright Eyes Caffeine Gel', ingredient: '5% caffeine + vitamin C', price: 21, tier: 2, concerns: ['dark_circle_v2'], types: ['oily', 'combination', 'normal', 'dry'] },

  { id: 'mo-light', step: 'moisturizer', name: 'Weightless Water Gel', ingredient: 'squalane + niacinamide', price: 20, tier: 1, concerns: ['oiliness', 'moisture'], types: ['oily', 'combination'] },
  { id: 'mo-barrier', step: 'moisturizer', name: 'Barrier Rich Cream', ingredient: 'ceramides + cholesterol', price: 27, tier: 2, concerns: ['moisture', 'redness', 'wrinkle'], types: ['dry', 'normal'] },
  { id: 'mo-luxe', step: 'moisturizer', name: 'Overnight Bounce Cream', ingredient: 'peptides + shea', price: 48, tier: 3, concerns: ['wrinkle', 'moisture', 'texture'], types: ['dry', 'normal', 'combination'] },

  { id: 'sp-fluid', step: 'spf', name: 'Daily Shield SPF 50 Fluid', ingredient: 'broad-spectrum SPF 50', price: 22, tier: 1, concerns: ['wrinkle', 'redness', 'texture'], types: ['oily', 'combination', 'normal', 'dry'] },
  { id: 'sp-tint', step: 'spf', name: 'Glow Veil Tinted SPF 40', ingredient: 'mineral SPF 40 + iron oxides', price: 34, tier: 3, concerns: ['redness', 'dark_circle_v2'], types: ['normal', 'dry', 'combination'] },
];

// Foundation shades: light to deep, each with an undertone.
export const FOUNDATION = [
  { id: 'fd-1c', name: '1C Porcelain', hex: '#F3D9C9', undertone: 'cool' },
  { id: 'fd-1w', name: '1W Ivory', hex: '#F1D7BA', undertone: 'warm' },
  { id: 'fd-2n', name: '2N Linen', hex: '#E6C3A5', undertone: 'neutral' },
  { id: 'fd-2w', name: '2W Honey Beige', hex: '#E2BC94', undertone: 'warm' },
  { id: 'fd-3c', name: '3C Rose Sand', hex: '#D4A994', undertone: 'cool' },
  { id: 'fd-3n', name: '3N Warm Sand', hex: '#CFA282', undertone: 'neutral' },
  { id: 'fd-4w', name: '4W Golden Tan', hex: '#BF8C62', undertone: 'warm' },
  { id: 'fd-4n', name: '4N Almond', hex: '#B07F5E', undertone: 'neutral' },
  { id: 'fd-5c', name: '5C Cocoa Rose', hex: '#946552', undertone: 'cool' },
  { id: 'fd-5w', name: '5W Chestnut', hex: '#8C5B3C', undertone: 'warm' },
  { id: 'fd-6n', name: '6N Espresso', hex: '#6B4432', undertone: 'neutral' },
  { id: 'fd-6c', name: '6C Ebony', hex: '#4E3128', undertone: 'cool' },
].map((s) => ({ ...s, step: 'foundation', price: 36, tier: 2 }));

export const LIPS = [
  { id: 'lp-nude', name: 'Barely Nude', hex: '#B98272', texture: 'satin', family: 'nude' },
  { id: 'lp-rose', name: 'Dusty Rose', hex: '#B5646E', texture: 'satin', family: 'rose' },
  { id: 'lp-berry', name: 'Soft Berry', hex: '#8E3B52', texture: 'matte', family: 'berry' },
  { id: 'lp-coral', name: 'Sunlit Coral', hex: '#D0645A', texture: 'sheer', family: 'coral' },
  { id: 'lp-red', name: 'Classic Red', hex: '#A8202E', texture: 'matte', family: 'red' },
  { id: 'lp-mocha', name: 'Mocha Kiss', hex: '#7A4638', texture: 'satin', family: 'brown' },
].map((s) => ({ ...s, step: 'lip', price: 22, tier: 1 }));

export const BLUSH = [
  { id: 'bl-peach', name: 'Peach Glow', hex: '#EE9C82' },
  { id: 'bl-pink', name: 'Petal Pink', hex: '#E58A9A' },
  { id: 'bl-berry', name: 'Berry Flush', hex: '#B85770' },
  { id: 'bl-terra', name: 'Terracotta', hex: '#C0674B' },
].map((s) => ({ ...s, step: 'blush', price: 24, tier: 1 }));

export const ALL_PRODUCTS = [...SKINCARE, ...FOUNDATION, ...LIPS, ...BLUSH];

export function productById(id) {
  return ALL_PRODUCTS.find((p) => p.id === id) ?? null;
}
