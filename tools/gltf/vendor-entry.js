import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const THREE = Object.assign({}, T, { GLTFLoader, SkeletonUtils, MeshoptDecoder });
(typeof window !== 'undefined' ? window : globalThis).THREE = THREE;
