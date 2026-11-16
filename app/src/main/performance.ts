interface CommandLine {
  getSwitchValue(name: string): string;
  appendSwitch(name: string, value?: string): void;
}

/** Must run before app.whenReady(). Keep preexisting Chromium feature exclusions. */
export function configureWindowsRendering(commandLine: CommandLine, platform = process.platform): void {
  if (platform !== 'win32') return;
  const features = commandLine.getSwitchValue('disable-features').split(',').map(value => value.trim()).filter(Boolean);
  commandLine.appendSwitch('disable-features', [...new Set([...features, 'CalculateNativeWinOcclusion'])].join(','));
  commandLine.appendSwitch('disable-renderer-backgrounding');
}
