/* @ts-self-types="./simplicity_lib.d.ts" */

import * as wasm from "./simplicity_lib_bg.wasm";
import { __wbg_set_wasm } from "./simplicity_lib_bg.js";
__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    compile, convert_script, create_psbt, create_pset, finalize_psbt, finalize_pset, sighash_psbt, sighash_pset
} from "./simplicity_lib_bg.js";
