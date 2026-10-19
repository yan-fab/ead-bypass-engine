// ==UserScript==
// @name         Auto-Injetor
// @namespace    http://tampermonkey.net/
// @version      15.0
// @description  Bypass de vídeos, resolvedor de provas de múltipla escolha e escritor fantasma para plataformas EAD (Unicte, Noz, Cademi, SpBIM).
// @author       Você
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================================
    // MÓDULO EXCLUSIVO SPBIM (ISOLADO — SEM CONFLITO COM UNICTE/NOZ/CADEMI)
    // =========================================================================
    if (window.location.hostname.includes('spbim.com.br')) {
        let ultimaPaginaCapturada = null;
        let executandoFilaSpBIM = false;

        // Intercepta respostas do Inertia.js caso ocorram via XHR
        const originalXHR = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(body) {
            this.addEventListener('load', function() {
                try {
                    const data = JSON.parse(this.responseText);
                    if (data && data.props && (data.props.moduleTree || data.props.course)) {
                        ultimaPaginaCapturada = data;
                    }
                } catch (e) {}
            });
            return originalXHR.call(this, body);
        };

        const obterTokenXsrf = () => {
            const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
            return match ? decodeURIComponent(match[1]) : '';
        };

        const obterDadosInertia = async () => {
            // 1. Se já capturamos via XHR
            if (ultimaPaginaCapturada && ultimaPaginaCapturada.props) {
                return ultimaPaginaCapturada;
            }

            // 2. Tenta no DOM atual (#app ou [data-page])
            const appEl = document.getElementById('app') || document.querySelector('[data-page]');
            if (appEl) {
                const rawPage = appEl.getAttribute('data-page');
                if (rawPage) {
                    try {
                        const parsed = JSON.parse(rawPage);
                        if (parsed && parsed.props) return parsed;
                    } catch (e) {}
                }
                const vuePage = appEl.__vue_app__?.config?.globalProperties?.$page;
                if (vuePage && vuePage.props && (vuePage.props.moduleTree || vuePage.props.course)) {
                    return vuePage;
                }
            }

            // 3. Fallback infalível: busca o HTML da página atual e extrai o atributo data-page original do servidor
            try {
                const res = await fetch(window.location.href, {
                    method: 'GET',
                    credentials: 'same-origin',
                    headers: { 'Accept': 'text/html,application/xhtml+xml' }
                });
                const html = await res.text();
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const pageNode = doc.querySelector('[data-page]') || doc.getElementById('app');
                if (pageNode) {
                    const dataPageStr = pageNode.getAttribute('data-page');
                    if (dataPageStr) {
                        const parsed = JSON.parse(dataPageStr);
                        if (parsed && parsed.props) return parsed;
                    }
                }
            } catch (e) {
                console.error('❌ [SpBIM] Falha ao buscar data-page via HTML:', e);
            }

            return null;
        };

        const extrairTodasAsAulas = (props) => {
            const mapa = new Map();
            const varrer = (modulos) => {
                if (!Array.isArray(modulos)) return;
                modulos.forEach(mod => {
                    if (Array.isArray(mod.videos)) {
                        mod.videos.forEach(v => {
                            if (v && v.id) mapa.set(Number(v.id), v);
                        });
                    }
                    if (Array.isArray(mod.children)) {
                        varrer(mod.children);
                    }
                });
            };
            varrer(props?.moduleTree);
            varrer(props?.course?.modules);
            varrer(props?.course?.all_modules);
            return Array.from(mapa.values());
        };

        const criarPainelStatus = () => {
            let box = document.getElementById('spbim-autoinjetor-hud');
            if (box) return box;

            box = document.createElement('div');
            box.id = 'spbim-autoinjetor-hud';
            box.style.cssText = `
                position: fixed; bottom: 16px; right: 16px; width: 350px;
                background: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif;
                font-size: 12px; border: 2px solid #4f46e5; border-radius: 10px;
                padding: 12px; z-index: 999999; box-shadow: 0 10px 25px rgba(0,0,0,0.7);
            `;
            document.body.appendChild(box);
            return box;
        };

        const atualizarHUD = (html) => {
            const box = criarPainelStatus();
            box.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-weight:700;color:#818cf8;">
                    <span>⚡ Auto-Injetor SpBIM (V15.0)</span>
                </div>
                <div style="color:#cbd5e1;line-height:1.4;">${html}</div>
            `;
        };

        const executarBypassSpBIM = async () => {
            if (executandoFilaSpBIM) return;
            if (!window.location.pathname.includes('/student/curso/')) return;

            executandoFilaSpBIM = true;
            atualizarHUD('🔍 Lendo lista de aulas do curso...');

            const pageData = await obterDadosInertia();
            if (!pageData || !pageData.props) {
                atualizarHUD('❌ Não foi possível ler os dados do curso.');
                executandoFilaSpBIM = false;
                return;
            }

            const props = pageData.props;
            const courseId = props.course?.id || window.location.pathname.split('/').pop();
            const inertiaVersion = pageData.version || '';
            const todasAulas = extrairTodasAsAulas(props);
            const concluidasSet = new Set((props.completedVideos || []).map(Number));

            const pendentes = todasAulas.filter(v => !concluidasSet.has(Number(v.id)));

            console.log(`🎯 [SpBIM] Curso #${courseId}: ${todasAulas.length} aulas mapeadas | ${concluidasSet.size} concluídas | ${pendentes.length} pendentes.`);

            if (pendentes.length > 0) {
                let concluidasAgora = 0;

                for (const aula of pendentes) {
                    concluidasAgora++;
                    const totalFeito = concluidasSet.size + concluidasAgora;
                    const pct = Math.round((totalFeito / todasAulas.length) * 100);
                    const tituloCurto = (aula.display_title || aula.title || `Aula #${aula.id}`).substring(0, 40);

                    atualizarHUD(`
                        <div>Enviando conclusão direta para o servidor...</div>
                        <div style="margin-top:4px;font-weight:bold;color:#34d399;">
                            [${totalFeito}/${todasAulas.length}] ${tituloCurto}
                        </div>
                        <div style="margin-top:6px;background:#1e293b;height:6px;border-radius:3px;overflow:hidden;">
                            <div style="background:#10b981;height:100%;width:${pct}%;"></div>
                        </div>
                    `);

                    try {
                        await fetch('https://plataforma.spbim.com.br/student/complete', {
                            method: 'POST',
                            credentials: 'same-origin',
                            headers: {
                                'Accept': 'text/html, application/xhtml+xml',
                                'Content-Type': 'application/json',
                                'X-Requested-With': 'XMLHttpRequest',
                                'X-XSRF-TOKEN': obterTokenXsrf(),
                                'X-Inertia': 'true',
                                'X-Inertia-Version': inertiaVersion
                            },
                            body: JSON.stringify({
                                video_id: aula.id,
                                is_completed: true
                            })
                        });
                        console.log(`✅ [SpBIM] Aula concluída: ID ${aula.id} (${aula.title})`);
                    } catch (err) {
                        console.error(`❌ [SpBIM] Erro na aula ${aula.id}:`, err);
                    }

                    // Pausa de 350ms entre requisições para evitar bloqueio 429
                    await new Promise(r => setTimeout(r, 350));
                }
            }

            // Consulta o endpoint de validação do curso e certificado
            try {
                const resComp = await fetch(`https://plataforma.spbim.com.br/student/classroom/course/${courseId}/completion`, {
                    method: 'GET',
                    credentials: 'same-origin',
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                const statusCurso = await resComp.json();
                console.log('🏆 [SpBIM] Status de conclusão do curso:', statusCurso);

                const certHtml = statusCurso.certificate_url
                    ? `<a href="${statusCurso.certificate_url}" target="_blank" style="display:block;margin-top:8px;background:#10b981;color:#000;text-align:center;padding:6px;border-radius:6px;font-weight:bold;text-decoration:none;">🎓 ABRIR CERTIFICADO</a>`
                    : `<div style="margin-top:6px;color:#fbbf24;font-size:11px;">Certificado: ${statusCurso.certificate_url ?? 'null'} | Avaliado (has_rating): ${statusCurso.has_rating}</div>`;

                atualizarHUD(`
                    <div style="color:#10b981;font-weight:bold;">✅ Servidor: ${statusCurso.completed}/${statusCurso.total} aulas (${statusCurso.progress}%)</div>
                    <div style="font-size:11px;margin-top:2px;">Curso Completo (complete): <b>${statusCurso.complete}</b></div>
                    ${certHtml}
                `);

                // Se acabamos de concluir aulas, recarrega a página 1 única vez para atualizar a barra lateral e liberar o certificado na UI
                if (pendentes.length > 0) {
                    setTimeout(() => window.location.reload(), 2000);
                }
            } catch (e) {
                if (pendentes.length > 0) {
                    setTimeout(() => window.location.reload(), 1500);
                }
            }
        };

        if (document.readyState === 'loading') {
            window.addEventListener('DOMContentLoaded', () => setTimeout(executarBypassSpBIM, 1200));
        } else {
            setTimeout(executarBypassSpBIM, 1200);
        }

        return; // Isolamento total: não executa nenhum código de outras plataformas na SpBIM!
    }

    let mudandoDePagina = false;
    let aguardandoResultado = false;

    // ==========================================
    // FUNÇÃO UNIVERSAL DE AVANÇO
    // ==========================================
    const irParaProximaAula = () => {
        const btnProximoCademi = document.querySelector('a.a-next');
        const botoesGenericos = Array.from(document.querySelectorAll('a, button')).filter(b => {
            const txt = b.textContent.toLowerCase().trim();
            return txt.includes('próxim') || txt.includes('avanç') || txt === 'seguir' || txt.includes('seguir ') || txt.includes('frente') || txt.includes('continuar') || txt.includes('concluir');
        });
        const btnSeguir = btnProximoCademi || botoesGenericos[0];

        if (btnSeguir && !btnSeguir.disabled && window.getComputedStyle(btnSeguir).display !== 'none') {
            console.log("⏩ Caminho livre! Avançando de tela...");
            mudandoDePagina = true;
            setTimeout(() => { mudandoDePagina = false; }, 5000);
            
            localStorage.removeItem('quiz_bot_state_' + window.location.pathname);

            btnSeguir.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => btnSeguir.click(), 500);
            return true;
        }
        return false;
    };

    // ==========================================
    // INJEÇÃO DE VÍDEOS (COMUM)
    // ==========================================
    setTimeout(() => {
        console.log("🤖 [Tampermonkey] Iniciando Escritor Fantasma (V15.0)...");

        const botoesProgresso = Array.from(document.querySelectorAll('a.progresso-click'));
        if (botoesProgresso.some(btn => btn.classList.contains('progresso-realizado') || btn.textContent.toLowerCase().includes('desmarcar'))) { irParaProximaAula(); return; }

        document.querySelectorAll('iframe').forEach(iframe => {
            const src = iframe.src || "";
            let origin = "*";
            try { origin = new URL(src).origin; } catch(e) {}
            if (src.includes('pandavideo')) {
                [JSON.stringify({ event: "ended" }), JSON.stringify({ message: "panda_event", event: "ended" })].forEach(payload => window.dispatchEvent(new MessageEvent('message', { data: payload, origin, source: iframe.contentWindow })));
            } else if (src.includes('vimeo')) {
                window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ event: "finish", type: "finish" }), origin, source: iframe.contentWindow }));
            } else if (src.includes('youtube.com/embed')) {
                window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ event: "infoDelivery", info: { playerState: 0 } }), origin, source: iframe.contentWindow }));
            }
        });

        botoesProgresso.forEach(btn => { if (btn.textContent.toLowerCase().includes('marcar')) btn.click(); });

        if (!window.location.hostname.includes('unicte.com') && !window.location.hostname.includes('appnoz.com.br')) {
            let tentativasChat = 0;
            const monitorDeSaida = setInterval(() => {
                const chatwoot = document.getElementById('cw-bubble-holder');
                const chatCarregou = (chatwoot && window.getComputedStyle(chatwoot).display !== 'none');
                tentativasChat++;
                if (chatCarregou || tentativasChat > 12) { clearInterval(monitorDeSaida); irParaProximaAula(); }
            }, 250);
        }
    }, 3000);

    const getGrupos = () => {
        const g = {};
        document.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(input => {
            let nome = input.name;
            if (!nome) { 
                const container = input.closest('div').parentElement.parentElement;
                nome = 'grupo_auto_' + container.textContent.trim().replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
            }
            if (!g[nome]) g[nome] = { tipo: input.type, inputs: [] };
            g[nome].inputs.push(input);
        });
        return g;
    };

    // ==========================================
    // RADAR CENTRAL DE RESOLUÇÃO
    // ==========================================
    setInterval(() => {
        if (mudandoDePagina) return; 
        if (!window.location.hostname.includes('unicte.com') && !window.location.hostname.includes('appnoz.com.br')) return; 
        if (irParaProximaAula()) return;

        // -----------------------------------------------------
        // ESCRITOR FANTASMA (Questões Abertas)
        // -----------------------------------------------------
        const textAreas = document.querySelectorAll('textarea');
        if (textAreas.length > 0) {
            let digitouAlgo = false;
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
            
            textAreas.forEach(ta => {
                let ehQuestao = false;
                let atual = ta.parentElement;
                for(let i=0; i<5; i++) { 
                    if(!atual) break;
                    const txt = (atual.innerText || "").toLowerCase();
                    if(txt.includes('questão') || txt.includes('enviar resposta') || txt.includes('desafio')) {
                        ehQuestao = true; break;
                    }
                    atual = atual.parentElement;
                }
                
                if (ehQuestao && window.getComputedStyle(ta).display !== 'none' && ta.value.trim().length < 2) {
                    nativeSetter.call(ta, "Compreendido e de acordo.");
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                    ta.dispatchEvent(new Event('change', { bubbles: true }));
                    digitouAlgo = true;
                }
            });

            if (digitouAlgo) {
                console.log("✍️ Questões dissertativas respondidas! Clicando em enviar...");
                setTimeout(() => {
                    const botoesEnviar = Array.from(document.querySelectorAll('button, a')).filter(b => {
                        const txt = b.textContent.toLowerCase().trim();
                        return txt.includes('enviar resposta') || txt === 'enviar' || txt === 'responder';
                    });
                    botoesEnviar.forEach(btn => {
                        if (!btn.disabled && window.getComputedStyle(btn).display !== 'none') {
                            btn.click();
                        }
                    });
                }, 500);
            }
        }

        // -----------------------------------------------------
        // RESOLVEDOR DE MÚLTIPLA ESCOLHA
        // -----------------------------------------------------
        const gruposInfo = getGrupos();
        const chavesGrupos = Object.keys(gruposInfo);

        if (chavesGrupos.length === 0) {
            const btnRevelar = Array.from(document.querySelectorAll('button, a')).find(b => {
                const txt = b.textContent.toLowerCase().trim();
                return txt.includes('pronto') || txt.includes('vamos') || txt.includes('ok');
            });
            if (btnRevelar && window.getComputedStyle(btnRevelar).display !== 'none') {
                console.log("🔓 Botão de Revelar detectado. Clicando...");
                btnRevelar.scrollIntoView({ behavior: 'smooth', block: 'center' });
                btnRevelar.click();
            }
            return; 
        }

        if (aguardandoResultado) {
            const btnReiniciar = Array.from(document.querySelectorAll('a, button')).find(b => b.textContent.toLowerCase().includes('reiniciar') || b.textContent.toLowerCase().includes('tentar novamente'));
            const tempoEspera = Date.now() - (window.tempoUltimoConfirmar || Date.now());
            
            if ((btnReiniciar && window.getComputedStyle(btnReiniciar).display !== 'none') || tempoEspera > 2500) {
                console.log("🔄 Lendo o resultado da tela...");
                aguardandoResultado = false;
                
                const memoriaId = 'quiz_bot_state_' + window.location.pathname;
                let state = JSON.parse(localStorage.getItem(memoriaId));
                
                if (state && state.grupos) {
                    const textoTela = document.body.innerText.toLowerCase();
                    const acertouParcialmente = textoTela.includes('parcialmente');

                    chavesGrupos.forEach(nome => {
                        const info = gruposInfo[nome];
                        const stateGrupo = state.grupos[nome];
                        
                        if (!stateGrupo || stateGrupo.resolvido) return; 

                        const temVerde = info.inputs.some(input => {
                             const area = input.closest('div')?.parentElement?.parentElement;
                             return area && (area.innerHTML.toLowerCase().includes('green') || area.innerHTML.toLowerCase().includes('emerald') || area.innerHTML.toLowerCase().includes('success') || area.className.toLowerCase().includes('green'));
                        });

                        if (temVerde) {
                            console.log(`✨ A questão ${nome} FICOU VERDE! Travando ela!`);
                            stateGrupo.resolvido = true;
                        } else {
                            if (info.tipo === 'radio') {
                                stateGrupo.currentIndex++;
                            } else {
                                if (stateGrupo.fase === 'testando') {
                                    if (acertouParcialmente) stateGrupo.correctIndices.push(stateGrupo.currentIndex);
                                    stateGrupo.currentIndex++;
                                    if (stateGrupo.currentIndex >= info.inputs.length) stateGrupo.fase = 'final';
                                } else if (stateGrupo.fase === 'final') {
                                    stateGrupo.currentIndex = 0;
                                    stateGrupo.correctIndices = [];
                                    stateGrupo.fase = 'testando';
                                }
                            }
                        }
                    });
                    localStorage.setItem(memoriaId, JSON.stringify(state));
                }

                if (btnReiniciar && window.getComputedStyle(btnReiniciar).display !== 'none') {
                    btnReiniciar.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    btnReiniciar.click();
                }
            }
            return; 
        }

        if (window.preenchendoQuiz) return;

        const memoriaId = 'quiz_bot_state_' + window.location.pathname;
        let state = JSON.parse(localStorage.getItem(memoriaId) || '{}');
        
        const pageHash = chavesGrupos.join('|');
        if (state.pageHash !== pageHash) {
            state = { pageHash: pageHash, grupos: {} };
        }

        let todasVerdes = true;
        chavesGrupos.forEach(nome => {
            if (!state.grupos[nome]) {
                state.grupos[nome] = { currentIndex: 0, correctIndices: [], fase: 'testando', resolvido: false };
            }
            if (!state.grupos[nome].resolvido) todasVerdes = false;
        });

        if (todasVerdes) {
            return;
        }

        window.preenchendoQuiz = true;

        const preencherTudoComCalma = async () => {
            for (const nome of chavesGrupos) {
                const info = gruposInfo[nome];
                const stateGrupo = state.grupos[nome];
                
                if (stateGrupo.resolvido) continue; 

                const infoFresquinha = getGrupos()[nome];
                if (!infoFresquinha) continue;

                for (let i = 0; i < infoFresquinha.inputs.length; i++) {
                    const inputAtual = infoFresquinha.inputs[i];
                    const alvoCerto = (infoFresquinha.tipo === 'radio') 
                        ? (i === (stateGrupo.currentIndex % infoFresquinha.inputs.length))
                        : ((stateGrupo.fase === 'testando' && i === stateGrupo.currentIndex) || (stateGrupo.fase === 'final' && stateGrupo.correctIndices.includes(i)));
                    
                    const darClique = async () => {
                        inputAtual.click();
                        inputAtual.dispatchEvent(new Event('change', { bubbles: true }));
                        await new Promise(r => setTimeout(r, 200)); 
                    };

                    if (infoFresquinha.tipo === 'radio') {
                        if (alvoCerto && !inputAtual.checked) await darClique();
                    } else {
                        if (inputAtual.checked !== alvoCerto) await darClique();
                    }
                }
            }

            localStorage.setItem(memoriaId, JSON.stringify(state));

            setTimeout(() => {
                const btnConfirmar = Array.from(document.querySelectorAll('button, a')).find(b => {
                    const txt = b.textContent.toLowerCase().trim();
                    return txt.includes('confirmar') || txt.includes('responder') || txt.includes('enviar') || txt.includes('validar') || txt.includes('avaliar') || txt.includes('pronto') || txt.includes('vamos') || txt.includes('ok');
                });

                if (btnConfirmar && !btnConfirmar.disabled) {
                    btnConfirmar.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    btnConfirmar.click();
                }
                
                aguardandoResultado = true; 
                window.tempoUltimoConfirmar = Date.now();
                window.preenchendoQuiz = false;
            }, 800);
        };

        preencherTudoComCalma();

    }, 500); 
})();
