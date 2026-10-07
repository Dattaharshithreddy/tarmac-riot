import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
const THREE = Object.assign({}, T, { GLTFLoader, SkeletonUtils });
(typeof window !== 'undefined' ? window : globalThis).THREE = THREE;
