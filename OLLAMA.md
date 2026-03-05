# Ollama - Qwen3.5 Local

## Instalação do Ollama

### Windows
1. Baixe em: https://ollama.com/download/windows
2. Instale o Ollama
3. O serviço roda automaticamente em `http://localhost:11434`

### Baixar Modelos

```bash
# Qwen3.5 9B (recomendado)
ollama pull qwen3.5:9b

# Qwen3.5 32B (se tiver GPU boa)
ollama pull qwen3.5:32b

# Llama 3.1 8B (alternativa rápida)
ollama pull llama3.1:8b

# Llama 3.3 70B (melhor qualidade)
ollama pull llama3.3:70b
```

### Verificar Modelos Instalados

```bash
ollama list
```

## Configuração no App

1. Abra **Settings** → **Motores AI**
2. Selecione **"Ollama (Local)"**
3. Em **Modelo**, digite o nome exato do modelo (ex: `qwen3.5:9b`)
4. Clique em **Salvar**

## Comandos Úteis

```bash
# Testar modelo
ollama run qwen3.5:9b "Olá, como você está?"

# Ver status
ollama ps

# Remover modelo
ollama rm qwen3.5:9b

# Atualizar modelo
ollama pull qwen3.5:9b
```

## Performance

| Modelo | RAM | VRAM | Velocidade |
|--------|-----|------|------------|
| Qwen3.5:9b | 6GB | 4GB | ~20 tok/s |
| Qwen3.5:32b | 20GB | 12GB | ~8 tok/s |
| Llama3.1:8b | 5GB | 4GB | ~30 tok/s |
| Llama3.3:70b | 40GB | 24GB | ~5 tok/s |

## Troubleshooting

### Ollama não responde
```bash
# Reiniciar serviço
ollama serve
```

### Modelo não encontrado
```bash
# Baixe o modelo
ollama pull qwen3.5:9b
```

### Lentidão
- Feche outros programas
- Use modelo menor (qwen3.5:9b ou llama3.1:8b)
- Configure GPU layers no Ollama

## Links

- [Ollama Site](https://ollama.com)
- [Ollama Models](https://ollama.com/library)
- [Qwen3.5](https://ollama.com/library/qwen3.5)
