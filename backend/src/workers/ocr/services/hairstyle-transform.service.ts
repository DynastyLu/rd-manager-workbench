import { Injectable } from '@nestjs/common';

const STYLE_PRESETS = {
  'short-bob': {
    label: '短波波',
    accent: '#111827',
    highlight: '#5eead4',
    hairPath:
      'M118 196 C112 128 152 74 257 74 C366 74 407 130 397 204 C369 154 331 138 257 138 C184 138 145 154 118 196 Z',
  },
  'air-bangs': {
    label: '空气刘海',
    accent: '#6b3f2a',
    highlight: '#fbbf24',
    hairPath:
      'M105 199 C116 112 166 70 258 70 C350 70 401 114 411 199 C364 148 306 132 257 133 C207 134 153 149 105 199 Z',
  },
  'long-wave': {
    label: '长卷发',
    accent: '#3f2417',
    highlight: '#f472b6',
    hairPath:
      'M91 237 C87 128 151 65 258 65 C366 65 430 129 424 239 C395 199 367 183 333 184 C310 184 287 197 258 197 C228 197 206 184 181 184 C148 184 120 200 91 237 Z',
  },
  'silver-wolf': {
    label: '银灰狼尾',
    accent: '#cbd5e1',
    highlight: '#38bdf8',
    hairPath:
      'M97 196 C105 116 162 67 259 67 C356 67 410 117 419 197 C373 161 329 145 275 143 C283 175 303 209 333 246 C295 231 270 211 257 188 C244 211 220 231 181 246 C212 210 233 176 239 143 C184 145 143 162 97 196 Z',
  },
} as const;

type HairstyleId = keyof typeof STYLE_PRESETS;

export interface HairstyleTransformInput {
  imageBuffer: Buffer;
  mimeType: string;
  style: string;
}

@Injectable()
export class HairstyleTransformService {
  listStyles() {
    return Object.entries(STYLE_PRESETS).map(([id, preset]) => ({
      id,
      label: preset.label,
    }));
  }

  async transform(input: HairstyleTransformInput) {
    const preset = STYLE_PRESETS[input.style as HairstyleId];
    if (!preset) {
      throw new Error('不支持的发型参数');
    }

    const svg = this.createDemoSvg({
      imageBuffer: input.imageBuffer,
      mimeType: input.mimeType,
      preset,
    });

    return {
      mode: 'demo' as const,
      data: {
        imageUrl: `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`,
        style: input.style,
        label: preset.label,
      },
    };
  }

  private createDemoSvg(input: {
    imageBuffer: Buffer;
    mimeType: string;
    preset: (typeof STYLE_PRESETS)[HairstyleId];
  }) {
    const imageData = `data:${input.mimeType};base64,${input.imageBuffer.toString('base64')}`;
    return `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <clipPath id="portraitClip"><rect x="0" y="0" width="512" height="512" rx="36"/></clipPath>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
    <linearGradient id="hairGloss" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${input.preset.highlight}" stop-opacity="0.65"/>
      <stop offset="0.48" stop-color="${input.preset.accent}" stop-opacity="0.98"/>
      <stop offset="1" stop-color="#020617" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="#09090f"/>
  <image href="${imageData}" x="0" y="0" width="512" height="512" preserveAspectRatio="xMidYMid slice" clip-path="url(#portraitClip)"/>
  <rect width="512" height="512" fill="rgba(4,8,18,0.28)" clip-path="url(#portraitClip)"/>
  <path d="${input.preset.hairPath}" fill="url(#hairGloss)" filter="url(#softShadow)" opacity="0.94"/>
  <path d="M139 169 C185 112 329 111 376 169" fill="none" stroke="${input.preset.highlight}" stroke-width="10" stroke-linecap="round" opacity="0.5"/>
  <path d="M165 132 C198 106 316 105 350 132" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="0.18"/>
  <rect x="20" y="20" width="472" height="472" rx="30" fill="none" stroke="${input.preset.highlight}" stroke-width="2" opacity="0.5"/>
</svg>`.trim();
  }
}
