import { about } from './about';
import { posts } from './posts';
import { life } from './life';
import { scope } from './scope';
import type { Tape } from './types';

/** 磁带架上的顺序。新磁带：在本目录建文件，再加到这里。 */
export const TAPES: Tape[] = [about, posts, life, scope];
