/*
 * Copyright (c) 2017 The Bacardi Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as mkdirp from 'mkdirp';
import * as nunjucks from 'nunjucks';
import * as path from 'path';

import * as file from './base/file';
import * as reader from './reader/simple_reader';

import snakeCase = require('snake-case');

import IDLDefinition from './parser/idl_definition';
import Parser from './parser/parser';
import {JsTypeInfos} from './types/js_type_traits';

const TEMPLATE_DIR = path.resolve(__dirname, '../../../template');

async function generateBacardi(
    env: nunjucks.Environment, output_path: string,
    definitions: IDLDefinition[]) {
  const [cpp_tmpl] = await Promise.all(
      [file.read(path.resolve(TEMPLATE_DIR, 'bacardi_cpp.njk'))]);
  const cpp_file_path = path.resolve(output_path, 'bacardi.cc');

  let idl_interfaces: IDLDefinition[] = [];
  definitions.forEach(async (definition) => {
    if (definition.isIDLInterface()) {
      idl_interfaces.push(definition);
    }
  });

  return file.write(
      cpp_file_path, env.renderString(cpp_tmpl, {interfaces: idl_interfaces}));
}

async function generateJsTypeTraits(
    env: nunjucks.Environment, output_path: string) {
  const js_type_tmpl =
      await file.read(path.resolve(TEMPLATE_DIR, 'jstypes_traits.njk'));
  const js_type_file_path = path.resolve(output_path, 'js_type_traits.h');
  await file.write(
      js_type_file_path, env.renderString(js_type_tmpl, {types: JsTypeInfos}));
}

async function generateInterface(
    env: nunjucks.Environment, output_path: string,
    definitions: IDLDefinition[]) {
  const [header_tmpl, cpp_tmpl] = await Promise.all([
    file.read(path.resolve(TEMPLATE_DIR, 'interface_header.njk')),
    file.read(path.resolve(TEMPLATE_DIR, 'interface_cpp.njk'))
  ]);

  definitions.forEach(async (definition) => {
    if (definition.isIDLInterface()) {
      const header_file_path = path.resolve(
          output_path,
          definition.idl_dir_name + '/' + snakeCase(definition.name) +
              '_bridge.h');
      const cpp_file_path = path.resolve(
          output_path,
          definition.idl_dir_name + '/' + snakeCase(definition.name) +
              '_bridge.cc');

      await file.write(
          header_file_path, env.renderString(header_tmpl, definition));
      await file.write(cpp_file_path, env.renderString(cpp_tmpl, definition));
    }
  });
}

async function main([root_dir, out_dir, ...idl_files]) {
  // We expect that current working directory will be $BACARDI_PATH. But it
  // might not be in Windows platform. So, we should resolve the path here.
  process.chdir(root_dir);

  let relative_idl_files: string[] = [];
  idl_files.forEach((idl_file) => {
    relative_idl_files.push(path.relative(root_dir, idl_file));
  });

  var env = new nunjucks.Environment();
  env.addFilter('camelcase', function(str, count) {
    return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function(match, index) {
      return index == 0 ? match.toUpperCase() : match;
    });
  });
  env.addFilter('snakecase', function(str, count) {
    return snakeCase(str);
  });

  let definitions: IDLDefinition[] =
      await Parser.parse(await reader.readAll(relative_idl_files));

  await generateJsTypeTraits(env, out_dir);
  await generateInterface(env, out_dir, definitions);
  await generateBacardi(env, out_dir, definitions);

  return 0;
}

main(process.argv.slice(2)).then(process.exit).catch(error => {
  console.log(error);
  process.exit(2);
});
