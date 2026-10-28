import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import { colors, fonts } from '@/theme/tokens';
type Variant = 'display' | 'headline' | 'title' | 'label' | 'body' | 'caption';
const styles = { display: { fontFamily: fonts.display, fontSize: 54, lineHeight: 52 }, headline: { fontFamily: fonts.display, fontSize: 38, lineHeight: 38 }, title: { fontFamily: fonts.bodyBold, fontSize: 21, lineHeight: 27 }, label: { fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 21 }, body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 }, caption: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 17, letterSpacing: 0.25 } } as const;
export function AppText({ variant = 'body', style, ...props }: ComponentProps<typeof Text> & { variant?: Variant }) { return <Text {...props} style={[{ color: colors.text }, styles[variant], style]} />; }
