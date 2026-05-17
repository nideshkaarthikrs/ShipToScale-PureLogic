'use client';

import WinningArgumentsPanel from '@/components/WinningArgumentsPanel';

export default function WinningArgumentsTab({ arguments: args, precedents }) {
  return <WinningArgumentsPanel arguments={args} precedents={precedents} />;
}
