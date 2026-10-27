import { useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { getSmsLinkReports, syncIncomingSmsWithLinks, type SmsLinkReport } from "../services/SMS";
import { getShortIncomingCalls, type ShortIncomingCall } from "../services/SPAM";
import { globalStyles } from "../styles/global";

export default function Denuncia() {
  const [calls, setCalls] = useState<ShortIncomingCall[]>([]);
  const [smsReports, setSmsReports] = useState<SmsLinkReport[]>([]);
  const [smsPermissionGranted, setSmsPermissionGranted] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const fetchReports = useCallback(async () => {
    const smsSyncResult =
      Platform.OS === "android" ? await syncIncomingSmsWithLinks() : null;
    const [loadedCalls, loadedSmsReports] = await Promise.all([
      getShortIncomingCalls(),
      getSmsLinkReports(),
    ]);

    return {
      calls: loadedCalls,
      smsReports: loadedSmsReports,
      smsPermissionGranted: smsSyncResult?.permissionGranted ?? null,
    };
  }, []);

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);

    try {
      const reports = await fetchReports();
      setCalls(reports.calls);
      setSmsReports(reports.smsReports);
      setSmsPermissionGranted(reports.smsPermissionGranted);
    } catch (error) {
      console.error("Erro ao carregar dados para a denúncia:", error);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [fetchReports]);

  useEffect(() => {
    let isActive = true;

    const loadInitialReports = async () => {
      try {
        const reports = await fetchReports();
        if (isActive) {
          setCalls(reports.calls);
          setSmsReports(reports.smsReports);
          setSmsPermissionGranted(reports.smsPermissionGranted);
        }
      } catch (error) {
        console.error("Erro ao carregar dados para a denúncia:", error);
        if (isActive) {
          setHasError(true);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadInitialReports();
    return () => {
      isActive = false;
    };
  }, [fetchReports]);

  const reportText =
    calls.length > 0? 
        [
          "Relato de ligações de curta duração",
          "",
          `Foram identificadas ${calls.length} ligações recebidas com duração de até 6 segundos. Os números de origem foram:`,
          ...calls.map((call, index) => `${index + 1}. ${call.phoneNumber}`),
          "",
          "Solicito a análise e apuração dessas ligações.",
        ].join("\n")
      : "Nenhuma ligação recebida de curta duração foi encontrada.";

  return (
    <View style={globalStyles.container}>
      <Text style={globalStyles.title}>Denúncia</Text>
      <ScrollView
        style={globalStyles.scrollView}
        contentContainerStyle={globalStyles.content}
      >
        {isLoading ? (
          <Text style={globalStyles.empty}>Carregando denúncias...</Text>
        ) : hasError ? (
          <Text style={globalStyles.empty}>
            Não foi possível carregar os dados da denúncia. Tente novamente.
          </Text>
        ) : (
          <>
            <Text style={globalStyles.count}>
              Ligações de curta duração: {calls.length}
            </Text>
            <Text selectable style={globalStyles.report}>
              {reportText}
            </Text>
            <Text style={globalStyles.sectionTitle}>
              Mensagens com links encontrados: {smsReports.length}
            </Text>
            {Platform.OS === "android" && smsPermissionGranted === false ? (
              <Text style={globalStyles.empty}>
                Permita o acesso às mensagens para verificar links recebidos.
              </Text>
            ) : smsReports.length === 0 ? (
              <Text style={globalStyles.empty}>
                Nenhuma mensagem recebida com links foi encontrada.
              </Text>
            ) : (
              smsReports.map((report, index) => (
                <Text
                  key={report.messageId}
                  selectable
                  style={[globalStyles.report, { marginBottom: 16 }]}
                >
                  {`Mensagem ${index + 1} — remetente: ${report.sender || "Desconhecido"}\nRecebida: ${new Date(report.receivedAt).toLocaleString()}\nLinks encontrados:\n${report.links.join("\n")}`}
                </Text>
              ))
            )}
          </>
        )}
        <TouchableOpacity
          accessibilityRole="button"
          disabled={isLoading}
          onPress={() => {
            void loadReports();
          }}
          style={[globalStyles.button, globalStyles.refreshButton]}
        >
          <Text style={globalStyles.buttonText}>
            {isLoading ? "Carregando..." : "Atualizar denúncia"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}