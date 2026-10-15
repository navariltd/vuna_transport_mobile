import { useCallback, useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, radius } from '../../shared/theme';

export function SignaturePad({ onChange }: { onChange: (svg: string | null) => void }) {
  const [paths, setPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState('');
  const [size, setSize] = useState({ width: 300, height: 150 });

  const emit = useCallback((nextPaths: string[]) => {
    setPaths(nextPaths);
    if (!nextPaths.length) return onChange(null);
    const lines = nextPaths.map((path) => `<path d="${path}" fill="none" stroke="#111111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    onChange(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(size.width)}" height="${Math.round(size.height)}" viewBox="0 0 ${Math.round(size.width)} ${Math.round(size.height)}"><rect width="100%" height="100%" fill="white"/>${lines}</svg>`);
  }, [onChange, size]);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      const { locationX, locationY } = event.nativeEvent;
      setActivePath(`M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`);
    },
    onPanResponderMove: (event) => {
      const { locationX, locationY } = event.nativeEvent;
      setActivePath((current) => `${current} L ${locationX.toFixed(1)} ${locationY.toFixed(1)}`);
    },
    onPanResponderRelease: () => {
      setActivePath((current) => {
        if (current) emit([...paths, current]);
        return '';
      });
    },
  }), [emit, paths]);

  const clear = () => { setActivePath(''); emit([]); };
  return (
    <View>
      <View
        onLayout={(event: LayoutChangeEvent) => setSize(event.nativeEvent.layout)}
        style={styles.pad}
        {...responder.panHandlers}
      >
        <Svg height="100%" width="100%">
          {paths.map((path, index) => <Path d={path} fill="none" key={`${index}-${path.length}`} stroke={colors.ink} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />)}
          {activePath ? <Path d={activePath} fill="none" stroke={colors.ink} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} /> : null}
        </Svg>
        {!paths.length && !activePath ? <Text pointerEvents="none" style={styles.hint}>Sign inside this box</Text> : null}
      </View>
      {paths.length ? <Pressable onPress={clear} style={styles.clear}><Text style={styles.clearText}>Clear signature</Text></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, height: 160, overflow: 'hidden' },
  hint: { color: colors.faint, fontFamily: 'Inter_400Regular', fontSize: 13, left: 0, position: 'absolute', right: 0, textAlign: 'center', top: 70 },
  clear: { alignSelf: 'flex-end', paddingVertical: 10 },
  clearText: { color: colors.danger, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});
