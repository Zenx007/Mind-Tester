import { BadRequestException, Injectable } from '@nestjs/common';
import { readdir, readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';

@Injectable()
export class CodeContextService {
  private readonly allowedExtensions = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.json',
    '.py',
    '.java',
    '.cs',
    '.go',
    '.rb',
    '.php',
    '.yaml',
    '.yml',
  ]);

  private readonly ignoredDirs = new Set([
    'node_modules',
    'dist',
    '.git',
    '.next',
    'build',
    'coverage',
    'out',
  ]);

  private readonly maxFiles = 80;
  private readonly maxCharsPerFile = 5000;
  private readonly maxCharsTotal = 120000;

  async resolveSourceCode(input: { codePath?: string; sourceCode?: string }): Promise<string | undefined> {
    if (input.codePath?.trim()) {
      return this.loadFromPath(input.codePath.trim());
    }

    if (input.sourceCode?.trim()) {
      return input.sourceCode.trim();
    }

    return undefined;
  }

  private async loadFromPath(codePath: string): Promise<string> {
    const absolutePath = path.resolve(codePath);

    let stats;
    try {
      stats = await stat(absolutePath);
    } catch {
      throw new BadRequestException({
        erro: 'Caminho de código inválido.',
        explicacao: `Não foi possível localizar o caminho informado: ${absolutePath}.`,
        sugestao:
          'Verifique se o caminho existe no computador e se a aplicação possui permissão de leitura.',
      });
    }

    if (stats.isFile()) {
      const fileContent = await readFile(absolutePath, 'utf-8');
      return this.buildSingleFileContext(absolutePath, fileContent);
    }

    if (stats.isDirectory()) {
      return this.buildDirectoryContext(absolutePath);
    }

    throw new BadRequestException({
      erro: 'Caminho de código não suportado.',
      explicacao: 'O caminho informado não é um arquivo nem uma pasta de código válida.',
      sugestao: 'Informe o caminho de um arquivo de código ou da pasta raiz do projeto.',
    });
  }

  private async buildDirectoryContext(rootPath: string): Promise<string> {
    const selectedFiles: string[] = [];
    const queue: string[] = [rootPath];

    while (queue.length > 0 && selectedFiles.length < this.maxFiles) {
      const currentDir = queue.shift()!;
      const entries = await readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (selectedFiles.length >= this.maxFiles) {
          break;
        }

        const entryPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (this.ignoredDirs.has(entry.name)) {
            continue;
          }
          queue.push(entryPath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        const ext = path.extname(entry.name).toLowerCase();
        if (this.allowedExtensions.has(ext)) {
          selectedFiles.push(entryPath);
        }
      }
    }

    if (selectedFiles.length === 0) {
      throw new BadRequestException({
        erro: 'Nenhum arquivo de código encontrado.',
        explicacao:
          'Não foram encontrados arquivos com extensões suportadas no caminho informado.',
        sugestao:
          'Aponte para a pasta correta do projeto ou para um arquivo específico de código-fonte.',
      });
    }

    const snippets: string[] = [];
    let totalChars = 0;

    for (const filePath of selectedFiles) {
      if (totalChars >= this.maxCharsTotal) {
        break;
      }

      const raw = await readFile(filePath, 'utf-8');
      const snippet = raw.slice(0, this.maxCharsPerFile);
      const relative = path.relative(rootPath, filePath);
      const block = `\n### Arquivo: ${relative}\n${snippet}`;

      totalChars += block.length;
      snippets.push(block);
    }

    return [
      `Contexto de código carregado de: ${rootPath}`,
      `Arquivos considerados: ${snippets.length}`,
      snippets.join('\n'),
    ].join('\n');
  }

  private buildSingleFileContext(filePath: string, content: string): string {
    const snippet = content.slice(0, this.maxCharsTotal);
    return [
      `Contexto de código carregado de arquivo: ${filePath}`,
      `\n### Arquivo: ${path.basename(filePath)}\n${snippet}`,
    ].join('\n');
  }
}
