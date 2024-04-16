import { ProofState } from '@aries-framework/core'
import { useAgent, useProofByState } from '@aries-framework/react-hooks'
import { ProofCustomMetadata, ProofMetadata } from '@hyperledger/aries-bifold-verifier'
import { useNavigation } from '@react-navigation/core'
import { createStackNavigator, StackCardStyleInterpolator, StackNavigationProp } from '@react-navigation/stack'
import { parseUrl } from 'query-string'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppState, DeviceEventEmitter } from 'react-native'
import { SvgUri } from 'react-native-svg'

import HeaderButton, { ButtonLocation } from '../components/buttons/HeaderButton'
import { EventTypes, walletTimeout } from '../constants'
import { TOKENS, useContainer } from '../container-api'
import { useAuth } from '../contexts/auth'
import { useConfiguration } from '../contexts/configuration'
import { DispatchAction } from '../contexts/reducers/store'
import { useStore } from '../contexts/store'
import { useTheme } from '../contexts/theme'
import { useDeepLinks } from '../hooks/deep-links'
import AttemptLockout from '../screens/AttemptLockout'
import Chat from '../screens/Chat'
import EducationScreen from '../screens/EducationList'
import EmployersScreen from '../screens/EmployersList'
import InstitutionDetailScreen from '../screens/InstitutionDetailScreen'
import MilitaryScreen from '../screens/MilitaryList'
import PINEnter from '../screens/PINEnter'
import StateGovernmentScreen from '../screens/StateGovernmentList'
import { BifoldError } from '../types/error'
import { AuthenticateStackParams, Screens, Stacks, TabStacks } from '../types/navigators'
import { connectFromInvitation, getOobDeepLink } from '../utils/helpers'
import { testIdWithKey } from '../utils/testable'

import ConnectStack from './ConnectStack'
import ContactStack from './ContactStack'
import DeliveryStack from './DeliveryStack'
import NotificationStack from './NotificationStack'
import ProofRequestStack from './ProofRequestStack'
import SettingStack from './SettingStack'
import TabStack from './TabStack'
import { createDefaultStackOptions } from './defaultStackOptions'

const RootStack: React.FC = () => {
  const [state, dispatch] = useStore()
  const { removeSavedWalletSecret } = useAuth()
  const { agent } = useAgent()
  const appState = useRef(AppState.currentState)
  const [backgroundTime, setBackgroundTime] = useState<number | undefined>(undefined)
  const [prevAppStateVisible, setPrevAppStateVisible] = useState<string>('')
  const [appStateVisible, setAppStateVisible] = useState<string>('')
  const { t } = useTranslation()
  const navigation = useNavigation<StackNavigationProp<AuthenticateStackParams>>()
  const theme = useTheme()
  const defaultStackOptions = createDefaultStackOptions(theme)
  const {
    splash,
    showPreface,
    enableImplicitInvitations,
    enableReuseConnections,
    enableUseMultUseInvitation,
    enablePushNotifications,
  } = useConfiguration()
  const container = useContainer()
  const OnboardingStack = container.resolve(TOKENS.STACK_ONBOARDING)
  const loadState = container.resolve(TOKENS.LOAD_STATE)
  const { version: TermsVersion } = container.resolve(TOKENS.SCREEN_TERMS)
  useDeepLinks()

  // remove connection on mobile verifier proofs if proof is rejected regardless of if it has been opened
  const declinedProofs = useProofByState([ProofState.Declined, ProofState.Abandoned])
  useEffect(() => {
    declinedProofs.forEach((proof) => {
      const meta = proof?.metadata?.get(ProofMetadata.customMetadata) as ProofCustomMetadata
      if (meta?.delete_conn_after_seen) {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        agent?.connections.deleteById(proof?.connectionId ?? '').catch(() => {})
        proof?.metadata.set(ProofMetadata.customMetadata, { ...meta, delete_conn_after_seen: false })
      }
    })
  }, [declinedProofs, state.preferences.useDataRetention])

  const lockoutUser = async () => {
    if (agent && state.authentication.didAuthenticate) {
      // make sure agent is shutdown so wallet isn't still open
      removeSavedWalletSecret()
      await agent.wallet.close()
      await agent.shutdown()
      dispatch({
        type: DispatchAction.DID_AUTHENTICATE,
        payload: [{ didAuthenticate: false }],
      })
      dispatch({
        type: DispatchAction.LOCKOUT_UPDATED,
        payload: [{ displayNotification: true }],
      })
    }
  }

  useEffect(() => {
    loadState(dispatch)
      .then(() => {
        dispatch({ type: DispatchAction.STATE_LOADED })
      })
      .catch((err) => {
        const error = new BifoldError(t('Error.Title1044'), t('Error.Message1044'), err.message, 1001)
        DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
      })
  }, [])

  // handle deeplink events
  useEffect(() => {
    async function handleDeepLink(deepLink: string) {
      // If it's just the general link with no params, set link inactive and do nothing
      if (deepLink.endsWith('//')) {
        dispatch({
          type: DispatchAction.ACTIVE_DEEP_LINK,
          payload: [undefined],
        })
        return
      }

      try {
        // Try connection based
        const receivedInvitation = await connectFromInvitation(
          deepLink,
          agent,
          enableImplicitInvitations,
          enableReuseConnections,
          enableUseMultUseInvitation
        )
        navigation.navigate(Stacks.ConnectionStack as any, {
          screen: Screens.Connection,
          params: { connectionId: receivedInvitation?.connectionRecord?.id },
        })
      } catch {
        try {
          // Try connectionless here
          const queryParams = parseUrl(deepLink).query
          const param = queryParams['d_m'] ?? queryParams['c_i']
          // if missing both of the required params, don't attempt to open OOB
          if (!param) {
            dispatch({
              type: DispatchAction.ACTIVE_DEEP_LINK,
              payload: [undefined],
            })
            return
          }
          const message = await getOobDeepLink(deepLink, agent)
          navigation.navigate(Stacks.ConnectionStack as any, {
            screen: Screens.Connection,
            params: { threadId: message['@id'] },
          })
        } catch (err: unknown) {
          const error = new BifoldError(
            t('Error.Title1039'),
            t('Error.Message1039'),
            (err as Error)?.message ?? err,
            1039
          )
          DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
        }
      }

      // set deeplink as inactive
      dispatch({
        type: DispatchAction.ACTIVE_DEEP_LINK,
        payload: [undefined],
      })
    }

    if (agent && state.deepLink.activeDeepLink && state.authentication.didAuthenticate) {
      handleDeepLink(state.deepLink.activeDeepLink)
    }
  }, [agent, state.deepLink.activeDeepLink, state.authentication.didAuthenticate])

  useEffect(() => {
    AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/active/) && nextAppState.match(/inactive|background/)) {
        //update time that app gets put in background
        setBackgroundTime(Date.now())
      }

      setPrevAppStateVisible(appState.current)
      appState.current = nextAppState
      setAppStateVisible(appState.current)
    })
  }, [])

  useEffect(() => {
    if (appStateVisible.match(/active/) && prevAppStateVisible.match(/inactive|background/) && backgroundTime) {
      // prevents the user from being locked out during metro reloading
      setPrevAppStateVisible(appStateVisible)
      //lock user out after 5 minutes
      if (
        !state.preferences.preventAutoLock &&
        walletTimeout &&
        backgroundTime &&
        Date.now() - backgroundTime > walletTimeout
      ) {
        lockoutUser()
      }
    }
  }, [appStateVisible, prevAppStateVisible, backgroundTime])

  const onAuthenticated = (status: boolean): void => {
    if (!status) {
      return
    }

    dispatch({
      type: DispatchAction.DID_AUTHENTICATE,
    })
  }

  const authStack = () => {
    const Stack = createStackNavigator()

    return (
      <Stack.Navigator initialRouteName={Screens.Splash} screenOptions={{ ...defaultStackOptions, headerShown: false }}>
        <Stack.Screen name={Screens.Splash} component={splash} />
        <Stack.Screen
          name={Screens.EnterPIN}
          options={() => ({
            title: t('Screens.EnterPIN'),
            headerShown: true,
            headerLeft: () => false,
            rightLeft: () => false,
          })}
        >
          {(props) => <PINEnter {...props} setAuthenticated={onAuthenticated} />}
        </Stack.Screen>
        <Stack.Screen
          name={Screens.AttemptLockout}
          component={AttemptLockout}
          options={{ headerShown: true, headerLeft: () => null }}
        ></Stack.Screen>
      </Stack.Navigator>
    )
  }

  const mainStack = () => {
    const Stack = createStackNavigator()

    // This function is to make the fade in behavior of both iOS and Android consistent for the settings menu
    const forFade: StackCardStyleInterpolator = ({ current }) => ({
      cardStyle: {
        opacity: current.progress,
      },
    })

    return (
      <Stack.Navigator initialRouteName={Screens.Splash} screenOptions={{ ...defaultStackOptions, headerShown: false }}>
        <Stack.Screen name={Screens.Splash} component={splash} />
        <Stack.Screen name={Stacks.TabStack} component={TabStack} />
        <Stack.Screen
          name={Screens.Chat}
          component={Chat}
          options={({ navigation }) => ({
            headerShown: true,
            title: t('Screens.CredentialOffer'),
            headerLeft: () => (
              <HeaderButton
                buttonLocation={ButtonLocation.Left}
                accessibilityLabel={t('Global.Back')}
                testID={testIdWithKey('BackButton')}
                onPress={() => {
                  navigation.navigate(TabStacks.HomeStack, { screen: Screens.Home })
                }}
                icon="arrow-left"
              />
            ),
          })}
        />
        <Stack.Screen name={Stacks.ConnectStack} component={ConnectStack} />
        <Stack.Screen
          name={Stacks.SettingStack}
          component={SettingStack}
          options={{
            cardStyleInterpolator: forFade,
          }}
        />
        <Stack.Screen name={Stacks.ContactStack} component={ContactStack} />
        <Stack.Screen name={Stacks.NotificationStack} component={NotificationStack} />
        <Stack.Screen name={Stacks.ConnectionStack} component={DeliveryStack} options={{ gestureEnabled: false }} />
        <Stack.Screen name={Stacks.ProofRequestsStack} component={ProofRequestStack} />
        <Stack.Screen
          name="EducationScreen"
          component={EducationScreen}
          options={{
            title: 'Education', // The title you want to display in the header
            // headerBackImage: () => (
            //   <Image
            //     source={require('../path-to-back-arrow-icon.png')} // Your back arrow icon
            //     style={{ width: 25, height: 25, marginLeft: 10 }}
            //   />
            // ),
            //the below suppose to show digicred logo and title on top but somehow doesnt work!?
            headerRight: () => (
              <SvgUri
                width="50"
                height="50"
                uri={require('../assets/img/digi-cred-logo.svg')}
                style={{ marginRight: 10 }}
              />
            ),
          }}
        />
        <Stack.Screen
          name="InstitutionDetail"
          component={InstitutionDetailScreen}
          options={{ title: 'Institution Details' }}
        />
        <Stack.Screen name="MilitaryScreen" component={MilitaryScreen} options={{ title: 'Military Opportunities' }} />

        <Stack.Screen
          name="EmployersScreen"
          component={EmployersScreen}
          options={{ title: 'Employers Opportunities' }}
        />
        <Stack.Screen
          name="StateGovernmentScreen"
          component={StateGovernmentScreen}
          options={{ title: 'State Government Opportunities' }}
        />
      </Stack.Navigator>
    )
  }

  if (
    (!showPreface || state.onboarding.didSeePreface) &&
    state.onboarding.didAgreeToTerms === TermsVersion &&
    state.onboarding.didCompleteTutorial &&
    state.onboarding.didCreatePIN &&
    (!state.preferences.enableWalletNaming || state.onboarding.didNameWallet) &&
    (state.onboarding.didConsiderPushNotifications || !enablePushNotifications) &&
    state.onboarding.didConsiderBiometry
  ) {
    return state.authentication.didAuthenticate ? mainStack() : authStack()
  }
  return <OnboardingStack />
}

export default RootStack
